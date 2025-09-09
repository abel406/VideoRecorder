import Dexie from 'dexie';

export const db = new Dexie('videoRecorderDB');
db.version(1).stores({
    recordings: '++id, createdAt' // auto-increment id, index by createdAt
});