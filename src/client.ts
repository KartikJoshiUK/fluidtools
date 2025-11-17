// FluidTools Client - Main entry point for library users

export interface FluidToolsClientConfig {
    /** Path to Postman collection JSON file */
    collectionPath: string;
    /** Authorization token for API calls */
    authToken: string;
}

export class FluidToolsClient {

    private collectionPath: string;
    private authToken: string;


    constructor(config: FluidToolsClientConfig) {
        this.collectionPath = config.collectionPath;
        this.authToken = config.authToken;
        
    }


    public async run() {
        console.log("Running FluidTools Client");
        console.log("Collection path: " + this.collectionPath);
        console.log("Auth token: " + this.authToken);
    }
}
