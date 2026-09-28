// The local domain provider's DNS, by hand (ADR-0032 §2): what a merchant's
// DNS host and the hosting provider would say about a domain. Development
// and E2E only; the dashboard and worker read the same state file.
//
//   pnpm domains:simulate <hostname> --txt "storevia-verification=…" --routed
//   pnpm domains:simulate <hostname> --routed --certificate-pending
//   pnpm domains:simulate <hostname> --clear             (DNS removed)
//   pnpm domains:simulate <hostname> --provider-removed  (gone from the project)
//   pnpm domains:simulate --reset
import { parseArgs } from "node:util";
import {
  localStatePath,
  resetLocalProvider,
  simulateDns,
  simulateExternalRemoval,
} from "../src/provisioner/local";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    txt: { type: "string", multiple: true },
    routed: { type: "boolean", default: false },
    "certificate-pending": { type: "boolean", default: false },
    clear: { type: "boolean", default: false },
    "provider-removed": { type: "boolean", default: false },
    reset: { type: "boolean", default: false },
  },
});

const path = localStatePath();
const hostname = positionals[0]?.trim().toLowerCase();

if (values.reset) {
  resetLocalProvider(path);
  console.log(`reset ${path}`);
} else if (!hostname) {
  console.error("usage: pnpm domains:simulate <hostname> [--txt VALUE] [--routed] [--clear]");
  process.exitCode = 1;
} else if (values["provider-removed"]) {
  simulateExternalRemoval(hostname, path);
  console.log(`${hostname}: removed from the simulated provider project`);
} else if (values.clear) {
  simulateDns(hostname, null, path);
  console.log(`${hostname}: DNS cleared`);
} else {
  simulateDns(
    hostname,
    {
      ...(values.txt ? { txt: values.txt } : {}),
      routed: values.routed,
      ...(values["certificate-pending"] ? { certificate: "pending" as const } : {}),
    },
    path,
  );
  console.log(`${hostname}: DNS set (${path})`);
}
