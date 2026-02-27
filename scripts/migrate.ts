import { getDb, closeDb } from '../src/lib/db';
import { runMigrations } from '../src/lib/migrations/runner';

const db = getDb();
runMigrations(db);
console.log('Migrations complete.');
closeDb();
