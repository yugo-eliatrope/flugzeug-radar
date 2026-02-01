import { AircraftDataRepeater } from './aircraft-data-repeater';
import { config } from './config';
import { AircraftData, UnsavedAircraftData } from './domain';
import { EventBus } from './event-bus';
import { readAllFilesInDir } from './fs';
import { HttpServer } from './http-server';
import { Logger } from './logger';
import { parseSBSLine } from './parser';
import { SBSClient } from './sbs-client';
import { AuthentificationService } from './services/authentification';
import { DatabaseService } from './services/database';
import { StatisticsService } from './services/statistics';
import { AircraftState } from './state';
import { WebSocketServer } from './ws-server';

const staticFilesPromise = readAllFilesInDir('./public');

const repeatParamFlag = '--repeatFrom';

const parseRepeatParam = (params: string[]) => {
  const line = params.find((p) => p.startsWith(repeatParamFlag));
  if (line) {
    const [, value] = line.split('=');
    return value;
  }
};

const lastSavedADs = new Map<string, UnsavedAircraftData>();

const recordsAreNotEqual = (a: UnsavedAircraftData, b: UnsavedAircraftData) => a.lat !== b.lat || a.lon !== b.lon;

const startUp = async () => {
  const repeatParam = parseRepeatParam(process.argv);
  const logger = new Logger();
  const database = new DatabaseService(logger.child('Database'));
  await database.connect();
  const spotNames = await database.getAllSpotNames();
  const eventBus = new EventBus();
  const savingToDB = !repeatParam;
  const authService = new AuthentificationService(database, config.server.authPassword);

  logger.info(savingToDB ? 'New data will be added to DB' : 'No data is being added to DB');
  logger.info(config.spot.name ? `Spot name set to "${config.spot.name}"` : 'No spot name configured');

  const statisticsService = new StatisticsService(spotNames, config.statistics, logger.child('StatisticsService'));

  const httpServer = new HttpServer(
    { port: config.server.port },
    logger.child('HTTPServer'),
    authService,
    database,
    statisticsService,
    await staticFilesPromise
  );

  const wsServer = new WebSocketServer(database, logger.child('WebSocketServer'), authService, config.spot);

  httpServer.server.on('upgrade', async (request, socket, head) => {
    await wsServer.handleUpgrade(request, socket, head);
  });

  httpServer.start();

  const sbs = repeatParam
    ? new AircraftDataRepeater(repeatParam, database, logger.child('Repeater'), eventBus)
    : new SBSClient(config.sbs, logger.child('SBSClient'), eventBus);
  const state = new AircraftState(config.state.maxAgeMs, config.spot.name, logger.child('State'), eventBus);

  const interval = setInterval(() => {
    wsServer.broadcastMessage({ type: 'aircrafts', payload: state.getAll() });
    state.cleanup();
  }, 500);

  interval.unref();

  const onReadsbData = (line: string) => {
    const parsed = parseSBSLine(line);
    state.update(parsed);
  };

  const onRepeaterData = (data: AircraftData) => {
    state.update({
      ...data,
      messageType: '0',
      transmissionType: 0,
      generatedAt: data.updatedAt,
    });
  };

  const onStateUpdated = async (aircraft: UnsavedAircraftData) => {
    if (savingToDB && aircraft.lat && aircraft.lon) {
      const lastSavedAD = lastSavedADs.get(aircraft.icao);
      if (
        !lastSavedAD ||
        (lastSavedAD.updatedAt.getTime() < aircraft.updatedAt.getTime() - config.aircraftDataSaveIntervalMs &&
          recordsAreNotEqual(lastSavedAD, aircraft))
      ) {
        lastSavedADs.set(aircraft.icao, aircraft);
        await database.saveAircraftData(aircraft);
      }
    }
  };

  const onStateRemoved = async (aircraft: UnsavedAircraftData) => {
    lastSavedADs.delete(aircraft.icao);
    if (savingToDB && aircraft.lat && aircraft.lon) {
      const lastSavedItem = await database.getLastAircraftData(aircraft.icao);
      if (!lastSavedItem || recordsAreNotEqual(lastSavedItem, aircraft)) {
        await database.saveAircraftData(aircraft);
      }
    }
  };

  eventBus.on('readsb:data', onReadsbData);
  eventBus.on('repeater:data', onRepeaterData);
  eventBus.on('state:updated', onStateUpdated);
  eventBus.on('state:removed', onStateRemoved);

  sbs.start();

  const shutdown = async () => {
    logger.info('Shutting down...');
    clearInterval(interval);
    eventBus.off('readsb:data', onReadsbData);
    eventBus.off('repeater:data', onRepeaterData);
    eventBus.off('state:updated', onStateUpdated);
    eventBus.off('state:removed', onStateRemoved);
    sbs.stop();
    await wsServer.close();
    await httpServer.stop();
    await database.disconnect();
    logger.info('Shut down complete');
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
};

startUp();
