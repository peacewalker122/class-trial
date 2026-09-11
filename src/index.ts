import { serve } from "./http/server.ts";

const { server } = serve();
console.log(`listening on ${server.url}`);
