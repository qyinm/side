import { defineConfig } from "cf/config";

export default defineConfig({
  accountId: "10334a9403586ee1f3d7afff7ccf055e",
  worker: {
    name: "side-landing",
    compatibilityDate: "2026-10-06",
    domains: ["side.qyinm.xyz"],
    workersDev: false,
  },
});
