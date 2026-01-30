import { GraphQLClient } from "graphql-request";
import { GRAPHQL_ENDPOINT } from "../constants";

export const graphqlClient = new GraphQLClient(GRAPHQL_ENDPOINT, {
  // Disable Next.js fetch caching for live data
  fetch: (url, options) => 
    fetch(url as string, { 
      ...options as RequestInit, 
      cache: "no-store",
      next: { revalidate: 0 }
    }),
});
