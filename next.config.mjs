/** @type {import('next').NextConfig} */
const nextConfig = {
  // The browser tests build into their own folder (NEXT_DIST_DIR=.next-e2e), so they can
  // run while the dev server is using .next
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // Don't let `next dev` write an AGENTS.md (instructions for AI coding assistants) into the repo
  agentRules: false,
};

export default nextConfig;
