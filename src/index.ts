import { WebSocketServer } from './ws-server';

import { config } from './config';
import { EventBus } from './event-bus';
import { Logger } from './logger';
import { parseSBSLine } from './parser';
import { SBSClient } from './sbs-client';
import { AircraftState } from './state';
import { DatabaseManager } from './database-manager';
import { AircraftDataRepeater } from './aircraft-data-repeater';
import { readAllFilesInDir } from './fs';
import { HttpServer } from './http-server';
import { AircraftData, UnsavedAircraftData } from './domain';

const staticFilesPromise = readAllFilesInDir('./public');

const AIRCRAFT_DATA_SAVE_INTERVAL_MS = 7_000;

const repeatParamFlag = '--repeatFrom';

const parseRepeatParam = (params: string[]) => {
  const line = params.find(p => p.startsWith(repeatParamFlag));
  if (line) {
    const [, value] = line.split('=');
    return value;
  }
};

const lastSavedAD: Record<string, Date> = {};

const startUp = async () => {
  const repeatParam = parseRepeatParam(process.argv);
  const logger = new Logger();
  const database = new DatabaseManager(logger.child('Database'));
  await database.connect();
  const eventBus = new EventBus();
  const savingToDB = !repeatParam;

  logger.info(savingToDB ? 'New data will be added to DB' : 'No data is being added to DB');

  const httpServer = new HttpServer(
    { port: config.server.port, authPassword: config.server.authPassword },
    logger.child('HTTPServer'),
    database,
    await staticFilesPromise
  );

  const wsServer = new WebSocketServer(
    database,
    logger.child('WebSocketServer'),
    httpServer.isAuthenticated
  );

  httpServer.server.on('upgrade', (request, socket, head) => {
    wsServer.handleUpgrade(request, socket, head);
  });

  httpServer.start();

  const sbs = repeatParam
    ? new AircraftDataRepeater(repeatParam, database, logger.child('Repeater'), eventBus)
    : new SBSClient(config.sbs, logger.child('SBSClient'), eventBus);
  const state = new AircraftState(config.state.maxAgeMs, logger.child('State'), eventBus);

  const interval = setInterval(() => {
    wsServer.broadcastMessage({ type: 'aircrafts', payload: state.getAll() })
    state.cleanup();
  }, 1000);

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
      const lastSavedTime = lastSavedAD[aircraft.icao];
      if (!lastSavedTime || lastSavedTime.getTime() < aircraft.updatedAt.getTime() - AIRCRAFT_DATA_SAVE_INTERVAL_MS) {
        lastSavedAD[aircraft.icao] = aircraft.updatedAt;
        await database.saveAircraftData(aircraft);
      }
    }
  };

  const onStateRemoved = async (aircraft: UnsavedAircraftData) => {
    delete lastSavedAD[aircraft.icao];
    if (savingToDB && aircraft.lat && aircraft.lon) {
      const lastSavedItem = await database.getLastAircraftData(aircraft.icao);
      if (!lastSavedItem || lastSavedItem.lat !== aircraft.lat || lastSavedItem.lon !== aircraft.lon) {
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
