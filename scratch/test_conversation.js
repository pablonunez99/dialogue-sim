import { startStream, sendDmResponse, sendNpcResponse, completeStream } from '../server/routes/conversation/scene/sceneStreamer.js';

class MockRes {
  constructor() {
    this.headers = {};
    this.events = [];
    this.ended = false;
  }

  setHeader(name, value) {
    this.headers[name] = value;
  }

  write(chunk) {
    this.events.push(chunk);
    console.log(chunk.trim());
  }

  end() {
    this.ended = true;
    console.log('END');
  }
}

const res = new MockRes();
startStream(res);
sendDmResponse(res, {
  locationId: 'castle',
  participantIds: ['guard'],
  narration: 'The gate creaks open.',
  newNpc: null,
  newLocation: null,
  locationUpdate: null
});

await new Promise((resolve) => setTimeout(resolve, 200));
sendNpcResponse(res, { speakerId: 'guard', line: 'Welcome, traveler.', expression: 'neutral' });

await new Promise((resolve) => setTimeout(resolve, 200));
completeStream(res, { turnComplete: true });
