/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Provider secrets live only in server runtime — never bundled to the client.
  serverExternalPackages: [],
};

export default nextConfig;
