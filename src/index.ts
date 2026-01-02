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
import { stat } from 'fs';

const staticFilesPromise = readAllFilesInDir('./public');

const AIRCRAFT_DATA_SAVE_INTERVAL_MS = 10_000;

const repeatParamFlag = '--repeatFrom';

const parseRepeatParam = (params: string[]) => {
  const line = params.find(p => p.startsWith(repeatParamFlag));
  if (line) {
    const [, value] = line.split('=');
    return value;
  }
};

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

  // setInterval(() => {
  //   const data = JSON.stringify({ type: 'aircrafts', payload: state.getAll() });

  //   for (const client of wss.clients) {
  //     if (client.readyState === 1) {
  //       client.send(data);
  //     }
  //   }

  //   state.cleanup();
  // }, 1000);

  // setInterval(async () => {
  //   if (wss.clients.size === 0) {
  //     return;
  //   }
  // const rawData = await database.getAllAircraftData();
  // const paths = { type: 'history', payload: formAircraftHistoryStore(rawData.reverse()) };
  //   const data = JSON.stringify(paths);

  //   for (const client of wss.clients) {
  //     if (client.readyState === 1) {
  //       client.send(data);
  //     }
  //   }
  // }, 10_000);

  // wss.on('connection', async (ws) => {
  //   const rawData = await database.getAllAircraftData();
  //   const paths = { type: 'history', payload: formAircraftHistoryStore(rawData.reverse()) };
  //   const data = JSON.stringify(paths);
  //   ws.send(data);
  // });

  eventBus.on('readsb:data', (line) => {
    logger.info(`Incoming line: '${line}'`);
    const parsed = parseSBSLine(line);
    state.update(parsed);
    console.log('Broadcasting to WS clients');
    wsServer.broadcastMessage({
      type: 'aircrafts',
      payload: state.getAll(),
    });
    state.cleanup();
  });

  eventBus.on('repeater:data', (data) => {
    state.update({
      ...data,
      messageType: '0',
      transmissionType: 0,
      generatedAt: data.updatedAt,
    });
    console.log('Broadcasting to WS clients');
    wsServer.broadcastMessage({
      type: 'aircrafts',
      payload: state.getAll(),
    });
    state.cleanup();
  });

  eventBus.on('state:updated', async (aircraft) => {
    if (savingToDB) {
      const lastSaved = (await database.getAircraftData({ limit: 1, from: new Date(Date.now() - AIRCRAFT_DATA_SAVE_INTERVAL_MS) }))[0];
      if (!lastSaved) {
        await database.saveAircraftData(aircraft);
      }
    }
  });

  sbs.start();
};

startUp();
