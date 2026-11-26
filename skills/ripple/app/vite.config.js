export default {
  resolve: { dedupe: ['three'] },
  optimizeDeps: { include: ['three', '3d-force-graph', 'three-spritetext', 'd3-force-3d'] },
  server: { watch: { ignored: ['**/data/lanes/**'] } },
};
