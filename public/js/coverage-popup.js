import { appState } from './state.js';

/**
 * Управление попапом покрытия радара
 */
export class CoveragePopup {
  constructor(mapAdapter) {
    this.mapAdapter = mapAdapter;
    this.popup = null;
    this.form = null;
    this.sliderContainer = null;
    this.spotNameInput = null;
    this.submitBtn = null;
    this.closeBtn = null;
    this.slider = null;
    this.heightValue = null;
    this.currentSpotDisplay = null;
    this.loadingText = null;
    this.currentCoverageData = null;
  }

  init() {
    this.popup = document.getElementById('coverage-popup');
    this.form = document.getElementById('coverage-form');
    this.sliderContainer = document.getElementById('coverage-slider-container');
    this.spotNameInput = document.getElementById('spot-name-input');
    this.submitBtn = document.getElementById('coverage-submit-btn');
    this.closeBtn = document.getElementById('coverage-popup-close');
    this.slider = document.getElementById('coverage-height-slider');
    this.heightValue = document.getElementById('coverage-height-value');
    this.currentSpotDisplay = document.getElementById('coverage-current-spot');
    this.loadingText = document.getElementById('coverage-loading');

    // Event listeners
    this.submitBtn.addEventListener('click', () => this.handleSubmit());
    this.closeBtn.addEventListener('click', () => this.close());
    this.slider.addEventListener('input', (e) => this.handleSliderChange(e));
    this.spotNameInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') this.handleSubmit();
    });
  }

  open() {
    this.popup.classList.add('show');
    this.showForm();
    this.spotNameInput.focus();
  }

  close() {
    this.popup.classList.remove('show');
    // Hide coverage and reset state
    if (this.mapAdapter.hideCoverage) {
      this.mapAdapter.hideCoverage();
    }
    if (this.mapAdapter.setCurrentCoverageSpot) {
      this.mapAdapter.setCurrentCoverageSpot(null);
    }
    this.currentCoverageData = null;
    this.reset();
    
    // Update button state
    const sidePanel = document.querySelector('side-panel');
    const coverageBtn = sidePanel?.shadowRoot?.getElementById('coverage-btn');
    if (coverageBtn) {
      coverageBtn.classList.remove('active');
    }
  }

  reset() {
    this.spotNameInput.value = '';
    this.slider.value = 0;
    this.showForm();
  }

  showForm() {
    this.form.style.display = 'block';
    this.sliderContainer.classList.remove('show');
    this.loadingText.style.display = 'none';
  }

  showSlider() {
    this.form.style.display = 'none';
    this.sliderContainer.classList.add('show');
  }

  setLoading(loading) {
    this.submitBtn.disabled = loading;
    this.spotNameInput.disabled = loading;
    this.loadingText.style.display = loading ? 'block' : 'none';
  }

  async handleSubmit() {
    const spotName = this.spotNameInput.value.trim();
    if (!spotName) return;

    // Check cache first
    if (appState.coverageCache.has(spotName)) {
      const cachedData = appState.coverageCache.get(spotName);
      this.loadCoverageData(spotName, cachedData);
      return;
    }

    // Fetch from server
    this.setLoading(true);
    try {
      const response = await fetch(`/statistics?spotName=${encodeURIComponent(spotName)}`);
      
      if (response.status === 400) {
        alert('Ошибка: не указано название точки');
        this.setLoading(false);
        return;
      }
      
      if (!response.ok) {
        throw new Error('Failed to fetch statistics');
      }
      
      const data = await response.json();
      
      // Cache the result
      appState.coverageCache.set(spotName, data.coverage);
      
      this.loadCoverageData(spotName, data.coverage);
    } catch (error) {
      console.error('Error fetching radar coverage:', error);
      alert('Ошибка при загрузке данных покрытия радара');
      this.setLoading(false);
    }
  }

  loadCoverageData(spotName, coverageData) {
    this.setLoading(false);
    
    if (!coverageData || !coverageData.layers || coverageData.layers.length === 0) {
      alert(`Нет данных покрытия для точки "${spotName}"`);
      return;
    }

    this.currentCoverageData = coverageData;
    if (this.mapAdapter.setCurrentCoverageSpot) {
      this.mapAdapter.setCurrentCoverageSpot(spotName);
    }

    // Show slider UI
    this.currentSpotDisplay.textContent = `Точка: ${spotName}`;
    this.slider.max = coverageData.layers.length - 1;
    this.slider.value = 0;
    this.showSlider();

    // Display first height level
    this.updateCoverage(0);
    
    // Update button state
    const sidePanel = document.querySelector('side-panel');
    const coverageBtn = sidePanel?.shadowRoot?.getElementById('coverage-btn');
    if (coverageBtn) {
      coverageBtn.classList.add('active');
    }
  }

  handleSliderChange(event) {
    const index = parseInt(event.target.value);
    this.updateCoverage(index);
  }

  updateCoverage(index) {
    if (!this.currentCoverageData || !this.currentCoverageData.layers) return;
    
    const heightLevel = this.currentCoverageData.layers[index];
    if (!heightLevel) return;

    // Update height display
    this.heightValue.textContent = `${heightLevel.maxHeight} м`;

    // Update map
    if (this.mapAdapter.showCoveragePolygon) {
      this.mapAdapter.showCoveragePolygon(heightLevel.polygon);
    }
  }

  toggle() {
    // Only works with Leaflet adapter
    if (appState.mapType.value !== 'leaflet') return;

    const isPopupOpen = this.popup.classList.contains('show');
    
    if (isPopupOpen) {
      this.close();
    } else {
      this.open();
    }
  }
}
