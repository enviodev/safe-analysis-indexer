import { GraphQLClient } from "graphql-request";
import { GRAPHQL_ENDPOINT } from "../constants";

export const graphqlClient = new GraphQLClient(GRAPHQL_ENDPOINT, {
  // Disable Next.js fetch caching for live data
  fetch: (url, options) => 
<<<<<<< HEAD
    fetch(url, { 
      ...options, 
=======
    fetch(url as string, { 
      ...options as RequestInit, 
>>>>>>> 2be53bd (fix: build errors)
      cache: "no-store",
      next: { revalidate: 0 }
    }),
});
