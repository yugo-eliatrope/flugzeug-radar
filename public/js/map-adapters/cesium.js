import { MapAdapter } from './base.js';
import { appState } from '../state.js';
import { COLORS, STALE_MS } from '../state.js';

/**
 * Cesium Map Adapter - реализация для 3D глобуса
 */
export class CesiumMapAdapter extends MapAdapter {
  constructor(containerId) {
    super(containerId);
    this.viewer = null;
    this.historyEntities = [];
    this.clickHandler = null;
    this.spotMarker = null;
  }

  initialize() {
    // Disable Cesium Ion token requirement
    Cesium.Ion.defaultAccessToken = undefined;

    // Create viewer with OpenStreetMap imagery
    this.viewer = new Cesium.Viewer(this.containerId, {
      imageryProvider: false, // We'll add it after
      baseLayerPicker: false,
      geocoder: false,
      homeButton: false,
      sceneModePicker: false,
      navigationHelpButton: false,
      animation: false,
      timeline: false,
      fullscreenButton: false,
      vrButton: false,
      infoBox: false,
      selectionIndicator: false,
      creditContainer: document.createElement('div'), // Hide credits
      contextOptions: {
        webgl: {
          antialias: true,
          powerPreference: "high-performance"
        }
      }
    });

    this.viewer.resolutionScale = window.devicePixelRatio;
    this.viewer.scene.postProcessStages.fxaa.enabled = false;
    this.viewer.scene.globe.maximumScreenSpaceError = 1.5;
    this.viewer.scene.globe.enableLighting = true;

    // Add dark theme imagery layer (CartoDB Dark Matter)
    const darkProvider = new Cesium.UrlTemplateImageryProvider({
      url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
      subdomains: ['a', 'b', 'c', 'd'],
      credit: '© OpenStreetMap contributors © CARTO',
    });

    this.viewer.imageryLayers.addImageryProvider(darkProvider);
    this.viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString('#0a0e14');

    console.info('CesiumJS: Dark theme imagery provider added');

    this.viewer.scene.globe.tileLoadProgressEvent.addEventListener((queueLength) => {
      if (queueLength === 0) {
        console.info('CesiumJS: All tiles loaded');
      }
    });

    this.viewer.scene.globe.depthTestAgainstTerrain = false;

    // Enable all camera controls
    this.viewer.scene.screenSpaceCameraController.enableRotate = true;
    this.viewer.scene.screenSpaceCameraController.enableTranslate = true;
    this.viewer.scene.screenSpaceCameraController.enableZoom = true;
    this.viewer.scene.screenSpaceCameraController.enableTilt = true;
    this.viewer.scene.screenSpaceCameraController.enableLook = true;

    // Set initial camera position
    this.viewer.camera.setView({
      destination: Cesium.Cartesian3.fromDegrees(13.405, 52.52, 1000000),
      orientation: {
        heading: Cesium.Math.toRadians(0),
        pitch: Cesium.Math.toRadians(-45),
        roll: 0.0
      }
    });

    // Setup click handler for aircraft selection
    this.clickHandler = new Cesium.ScreenSpaceEventHandler(this.viewer.scene.canvas);
    this.clickHandler.setInputAction((click) => {
      const pickedObject = this.viewer.scene.pick(click.position);
      if (Cesium.defined(pickedObject) && pickedObject.id) {
        const entity = pickedObject.id;
        if (entity.id && this.planes.has(entity.id)) {
          appState.selectedAircraft.value = entity.id;
        }
      }
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
  }

  addOrUpdateAircraft(rec) {
    if (!rec.icao || rec.lat == null || rec.lon == null) return;

    const key = rec.icao;
    const track = Number.isFinite(rec.track) ? rec.track : 0;
    const altitude = rec.altitude != null ? rec.altitude * 0.3048 : 1000;
    const flight = rec.flight?.trim() || '';
    const isSelected = appState.selectedAircraft.value === key;

    const position = Cesium.Cartesian3.fromDegrees(rec.lon, rec.lat, altitude);

    const existing = this.planes.get(key);
    if (existing) {
      // Update existing entity
      existing.entity.position = position;

      const heading = Cesium.Math.toRadians(track - 90);
      existing.entity.orientation = Cesium.Transforms.headingPitchRollQuaternion(
        position,
        new Cesium.HeadingPitchRoll(heading, 0, 0)
      );

      const groundPosition = Cesium.Cartesian3.fromDegrees(rec.lon, rec.lat, 0);
      if (existing.groundLine) {
        existing.groundLine.polyline.positions = [position, groundPosition];
      }

      if (existing.entity.label) {
        existing.entity.label.text = flight ? flight.toUpperCase() : key.toUpperCase();
      }

      if (existing.entity.model) {
        existing.entity.model.color = isSelected
          ? Cesium.Color.fromCssColorString('#ff6b35')
          : Cesium.Color.fromCssColorString('#00d9ff');
      }

      existing.lastUpdated = Date.now();
      existing.record = rec;
    } else {
      // Create new entity
      const entity = this.viewer.entities.add({
        id: key,
        position: position,
        orientation: Cesium.Transforms.headingPitchRollQuaternion(
          position,
          new Cesium.HeadingPitchRoll(Cesium.Math.toRadians(track - 90), 0, 0)
        ),
        model: {
          uri: '/public/airplane.glb',
          minimumPixelSize: 32,
          maximumScale: 20000,
          scale: 50.0,
          color: isSelected
            ? Cesium.Color.fromCssColorString('#ff6b35')
            : Cesium.Color.fromCssColorString('#00d9ff'),
          colorBlendMode: Cesium.ColorBlendMode.MIX,
          colorBlendAmount: 0.7,
        },
        label: {
          text: flight ? flight.toUpperCase() : key.toUpperCase(),
          font: '12px JetBrains Mono, monospace',
          fillColor: Cesium.Color.WHITE,
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 2,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          pixelOffset: new Cesium.Cartesian2(0, -40),
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      });

      const groundPosition = Cesium.Cartesian3.fromDegrees(rec.lon, rec.lat, 0);
      const groundLine = this.viewer.entities.add({
        polyline: {
          positions: [position, groundPosition],
          width: 2,
          material: Cesium.Color.fromCssColorString('#6e7681').withAlpha(0.5),
          depthFailMaterial: Cesium.Color.fromCssColorString('#6e7681').withAlpha(0.2),
        },
      });

      this.planes.set(key, { entity, groundLine, lastUpdated: Date.now(), record: rec });
    }
  }

  removeAircraft(icao) {
    const plane = this.planes.get(icao);
    if (plane) {
      this.viewer.entities.remove(plane.entity);
      if (plane.groundLine) {
        this.viewer.entities.remove(plane.groundLine);
      }
      this.planes.delete(icao);
    }
  }

  updateAircraftSelection(icao, isSelected) {
    const plane = this.planes.get(icao);
    if (plane && plane.entity.model) {
      plane.entity.model.color = isSelected
        ? Cesium.Color.fromCssColorString('#ff6b35')
        : Cesium.Color.fromCssColorString('#00d9ff');
    }
  }

  renderFlightHistory(flights) {
    this.clearFlightHistory();

    for (let i = 0; i < flights.length; i++) {
      this._renderHistoryPath(flights[i].segments, i);
    }
  }

  _renderHistoryPath(coords, colorIndex = 0) {
    if (!Array.isArray(coords) || coords.length < 2) return;

    this._renderLine(coords, '#4a5568');
    const isSmallGap = (t1, t2) => Math.abs(new Date(t1).getTime() - new Date(t2).getTime()) < 60_000;

    let richSegments = [coords[0]];
    for (let i = 1; i < coords.length; ++i) {
      const a = coords[i - 1];
      const b = coords[i];
      if (isSmallGap(a.time, b.time)) {
        if (!richSegments.length) richSegments.push(a);
        richSegments.push(b);
      } else {
        this._renderLine(richSegments, COLORS[colorIndex % COLORS.length]);
        richSegments = [];
      }
    }
    if (richSegments.length) this._renderLine(richSegments, COLORS[colorIndex % COLORS.length]);
  }

  _renderLine(coords, color) {
    const positionsWithCoords = coords
      .map(c => {
        if (c && Number.isFinite(c.lat) && Number.isFinite(c.lon)) {
          const alt = c.altitude != null ? c.altitude * 0.3048 : 1000;
          return {
            position: Cesium.Cartesian3.fromDegrees(c.lon, c.lat, alt),
            lat: c.lat,
            lon: c.lon,
            alt: alt
          };
        }
        return null;
      })
      .filter(p => p !== null);

    if (positionsWithCoords.length < 2) return;

    const positions = positionsWithCoords.map(p => p.position);

    // Create the main flight path polyline
    const entity = this.viewer.entities.add({
      polyline: {
        positions: positions,
        width: 3,
        material: Cesium.Color.fromCssColorString(color).withAlpha(0.8),
        clampToGround: false,
      },
    });

    this.historyEntities.push(entity);

    // Add transparent wall from flight path to ground
    this._addPathWall(positionsWithCoords, color);
  }

  _addPathWall(positionsWithCoords, pathColor) {
    if (positionsWithCoords.length < 2) return;

    // Create positions array for the wall (geographic positions with heights)
    const wallPositions = positionsWithCoords.map(p =>
      Cesium.Cartographic.fromDegrees(p.lon, p.lat, p.alt)
    );

    // Create a wall entity that extends from the flight path down to the ground
    const wallEntity = this.viewer.entities.add({
      wall: {
        positions: wallPositions.map(c =>
          Cesium.Cartesian3.fromRadians(c.longitude, c.latitude, c.height)
        ),
        minimumHeights: new Array(wallPositions.length).fill(0), // Ground level
        maximumHeights: wallPositions.map(c => c.height), // Flight path altitude
        material: Cesium.Color.ORANGE.withAlpha(0.15), // Transparent orange
        outline: false,
      },
    });

    this.historyEntities.push(wallEntity);
  }

  clearFlightHistory() {
    for (const entity of this.historyEntities) {
      this.viewer.entities.remove(entity);
    }
    this.historyEntities = [];
  }

  focusOnHistory(coords) {
    if (coords.length > 1) {
      const positions = coords.map(c => {
        const alt = c.alt != null ? c.alt * 0.3048 : 1000;
        return Cesium.Cartesian3.fromDegrees(c.lon, c.lat, alt);
      });

      const boundingSphere = Cesium.BoundingSphere.fromPoints(positions);
      this.viewer.camera.flyToBoundingSphere(boundingSphere, {
        duration: 2.0,
        offset: new Cesium.HeadingPitchRange(0, Cesium.Math.toRadians(-45), boundingSphere.radius * 3)
      });
    }
  }

  focusOnAircraft(icao) {
    const plane = this.planes.get(icao);
    if (plane && plane.record) {
      const { lat, lon, altitude } = plane.record;
      if (lat != null && lon != null) {
        const alt = altitude != null ? altitude * 0.3048 : 1000;
        this.viewer.camera.flyTo({
          destination: Cesium.Cartesian3.fromDegrees(lon, lat, alt + 50000),
          duration: 2.0,
          orientation: {
            heading: Cesium.Math.toRadians(0),
            pitch: Cesium.Math.toRadians(-45),
            roll: 0.0
          }
        });
      }
    }
  }

  zoomIn() {
    const distance = this.viewer.camera.getMagnitude();
    this.viewer.camera.zoomIn(distance * 0.25);
  }

  zoomOut() {
    const distance = this.viewer.camera.getMagnitude();
    this.viewer.camera.zoomOut(distance * 0.25);
  }

  cleanup() {
    const now = Date.now();
    for (const [key, obj] of this.planes.entries()) {
      if (now - obj.lastUpdated > STALE_MS) {
        this.removeAircraft(key);
      }
    }
  }

  focusOnFirstAircraft() {
    const planeArray = [...this.planes.values()];
    if (planeArray.length) {
      let totalLat = 0, totalLon = 0, totalAlt = 0;
      for (const p of planeArray) {
        totalLat += p.record.lat || 0;
        totalLon += p.record.lon || 0;
        totalAlt += (p.record.altitude || 0) * 0.3048;
      }
      const avgLat = totalLat / planeArray.length;
      const avgLon = totalLon / planeArray.length;
      const avgAlt = totalAlt / planeArray.length;

      this.viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(avgLon, avgLat, avgAlt + 500000),
        duration: 3.0,
        orientation: {
          heading: Cesium.Math.toRadians(0),
          pitch: Cesium.Math.toRadians(-60),
          roll: 0.0
        }
      });
    }
  }

  // Coverage methods (not supported in 3D mode, stubs for consistency)
  showCoveragePolygon(polygon) {
    // Coverage visualization not supported in 3D mode
  }

  hideCoverage() {
    // Coverage visualization not supported in 3D mode
  }

  hasCoverage() {
    return false;
  }

  setCurrentCoverageSpot(spotName) {
    // Coverage visualization not supported in 3D mode
  }

  getCurrentCoverageSpot() {
    return null;
  }

  showSpotMarker(spot) {
    if (!spot || spot.lat == null || spot.lon == null) return;
    
    // Remove existing spot marker if present
    this.removeSpotMarker();
    
    const position = Cesium.Cartesian3.fromDegrees(spot.lon, spot.lat, 0);
    
    this.spotMarker = this.viewer.entities.add({
      position: position,
      point: {
        pixelSize: 12,
        color: Cesium.Color.fromCssColorString('#f85149'),
        outlineColor: Cesium.Color.WHITE,
        outlineWidth: 2,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
      label: {
        text: spot.name || 'Spot',
        font: '12px JetBrains Mono, monospace',
        fillColor: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 2,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        pixelOffset: new Cesium.Cartesian2(0, -20),
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
    });
  }
  
  removeSpotMarker() {
    if (this.spotMarker) {
      this.viewer.entities.remove(this.spotMarker);
      this.spotMarker = null;
    }
  }

  destroy() {
    // Clean up all entities
    this.clearFlightHistory();
    this.removeSpotMarker();
    for (const [icao] of this.planes) {
      this.removeAircraft(icao);
    }

    // Destroy click handler
    if (this.clickHandler) {
      this.clickHandler.destroy();
      this.clickHandler = null;
    }

    // Destroy Cesium viewer
    if (this.viewer) {
      this.viewer.destroy();
      this.viewer = null;
    }
  }
}
