// Entry stubs that make the YouTube build's code land in several files, each under the 512 KiB per-file guidance. esbuild cuts its output
// into files by "which entry points reach this module", so one tiny entry inside Three.js's core and one inside its renderer
// are enough to put each in its own file (see playablesConfig in tools/bundle.mjs). They export a single name each, so nothing
// extra is kept; the stub output files themselves are deleted after the build.
export { Object3D } from '../../node_modules/three/build/three.core.js';
