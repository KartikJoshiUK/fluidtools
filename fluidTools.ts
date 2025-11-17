import { z } from 'zod';
import { tool } from 'langchain';
import axios from 'axios';

// Generated LangChain tools from Postman collection

export function generateTools(authToken?: string) {
  const tools: Record<string, any> = {};

  // List Key Pairs
  const list_key_pairs = tool(
    async (args: any) => {
      try {
        let url = 'https://customer.acecloudhosting.com/api/v1/cloud/key-pairs?region=ap-south-noi-1&project_id=6912690968ce46cb8ac7b4a96e91beee';
        const params = new URLSearchParams();
        if (args.region) params.append('region', args.region);
        if (args.project_id) params.append('project_id', args.project_id);
        if (params.toString()) url += (url.includes('?') ? '&' : '?') + params.toString();
        const res = await axios.get(url, {
          headers: authToken ? { 'Authorization': `Bearer ${authToken}` } : {},
        });
        return JSON.stringify(res.data, null, 2);
      } catch (err: any) {
        console.log("🚨 API ERROR");
        return `Error: ${err.message}`;
      }
    },
    {
      name: 'list_key_pairs',
      description: 'GET request to https://customer.acecloudhosting.com/api/v1/cloud/key-pairs?region=ap-south-noi-1&project_id=6912690968ce46cb8ac7b4a96e91beee',
      schema: z.object({
        region: z.string().optional().describe('region parameter'),
        project_id: z.string().optional().describe('project_id parameter'),
      }),
    }
  );
  tools["list_key_pairs"] = (list_key_pairs);

  // Create Key Pair
  const create_key_pair = tool(
    async (args: any) => {
      try {
        const res = await axios.post('https://customer.acecloudhosting.com/api/v1/cloud/key-pairs?region=ap-south-noi-1&project_id=6912690968ce46cb8ac7b4a96e91beee', args.body || {}, {
          headers: authToken ? { 'Authorization': `Bearer ${authToken}` } : {},
        });
        return JSON.stringify(res.data, null, 2);
      } catch (err: any) {
        console.log("🚨 API ERROR");
        return `Error: ${err.message}`;
      }
    },
    {
      name: 'create_key_pair',
      description: 'POST request to https://customer.acecloudhosting.com/api/v1/cloud/key-pairs?region=ap-south-noi-1&project_id=6912690968ce46cb8ac7b4a96e91beee',
      schema: z.object({
        body: z.any().optional(),
      }),
    }
  );
  tools["create_key_pair"] = (create_key_pair);

  // Wallet Status
  const wallet_status = tool(
    async (args: any) => {
      try {
        const res = await axios.get('https://customer.acecloudhosting.com/api/v1/wallet', {
          headers: authToken ? { 'Authorization': `Bearer ${authToken}` } : {},
        });
        return JSON.stringify(res.data, null, 2);
      } catch (err: any) {
        console.log("🚨 API ERROR");
        return `Error: ${err.message}`;
      }
    },
    {
      name: 'wallet_status',
      description: 'GET request to https://customer.acecloudhosting.com/api/v1/wallet',
      schema: z.object({
        query: z.string().optional(),
      }),
    }
  );
  tools["wallet_status"] = (wallet_status);

  // User Status
  const user_status = tool(
    async (args: any) => {
      try {
        const res = await axios.get('https://customer.acecloudhosting.com/api/v1/auth/user-status', {
          headers: authToken ? { 'Authorization': `Bearer ${authToken}` } : {},
        });
        return JSON.stringify(res.data, null, 2);
      } catch (err: any) {
        console.log("🚨 API ERROR");
        return `Error: ${err.message}`;
      }
    },
    {
      name: 'user_status',
      description: 'GET request to https://customer.acecloudhosting.com/api/v1/auth/user-status',
      schema: z.object({
        query: z.string().optional(),
      }),
    }
  );
  tools["user_status"] = (user_status);

  // Allowed Projects
  const allowed_projects = tool(
    async (args: any) => {
      try {
        const res = await axios.get('https://customer.acecloudhosting.com/api/v1/projects/allowed-projects', {
          headers: authToken ? { 'Authorization': `Bearer ${authToken}` } : {},
        });
        return JSON.stringify(res.data, null, 2);
      } catch (err: any) {
        console.log("🚨 API ERROR");
        return `Error: ${err.message}`;
      }
    },
    {
      name: 'allowed_projects',
      description: 'GET request to https://customer.acecloudhosting.com/api/v1/projects/allowed-projects',
      schema: z.object({
        query: z.string().optional(),
      }),
    }
  );
  tools["allowed_projects"] = (allowed_projects);

  // Wallet Details
  const wallet_details = tool(
    async (args: any) => {
      try {
        const res = await axios.get('https://customer.acecloudhosting.com/api/v1/billing/info', {
          headers: authToken ? { 'Authorization': `Bearer ${authToken}` } : {},
        });
        return JSON.stringify(res.data, null, 2);
      } catch (err: any) {
        console.log("🚨 API ERROR");
        return `Error: ${err.message}`;
      }
    },
    {
      name: 'wallet_details',
      description: 'GET request to https://customer.acecloudhosting.com/api/v1/billing/info',
      schema: z.object({
        query: z.string().optional(),
      }),
    }
  );
  tools["wallet_details"] = (wallet_details);

  return tools;
}
