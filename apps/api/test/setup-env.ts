import { config } from 'dotenv';

// Local runs read apps/api/.env.test; CI sets the variables directly and has no file.
config({ path: '.env.test', override: true, quiet: true });
