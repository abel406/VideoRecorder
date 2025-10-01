import Dexie, { Table } from 'dexie';

export interface Recording {
    id?: number;            // ++id (auto-increment)
    name?: string;
    bytes?: number;
    createdAt: number;      // you index on this
    updatedAt?: number;
    durationSeconds?: number;
    mimeType?: string;
    blob: Blob;             // stored in IndexedDB
}

export class MediaDB extends Dexie {
    recordings!: Table<Recording, number>;

    constructor() {
        super('videoRecorderDB');

        // schema: primary key ++id, index on createdAt
        this.version(1).stores({
            recordings: '++id, createdAt',
        });

        // IMPORTANT: wire the table to the class property
        this.recordings = this.table<Recording, number>('recordings');
    }
}

export const db = new MediaDB();