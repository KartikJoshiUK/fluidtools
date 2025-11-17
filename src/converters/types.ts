// Converter to transform Postman collections to LangChain tools

export interface PostmanRequest {
    name: string;
    request: {
        method: string;
        url: {
            raw: string;
        };
        body?: {
            mode?: string;
            raw?: string;
        };
        description?: string;
    };
}