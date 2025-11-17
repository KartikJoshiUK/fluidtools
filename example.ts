// Example usage of FluidTools Client

import 'dotenv/config';
import { FluidToolsClient } from './src/index.js';

async function main() {
    // Create client with Postman collection
    const client = new FluidToolsClient({
        collectionPath: './api.json',
        authToken: "hello",
    });
   

    client.run().then((result) => {
        console.log(result);
    }).catch((error) => {
        console.error(error);
    });
}

main().catch(console.error);
