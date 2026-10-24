// The arena floor writes 1 into the stencil buffer; everything that must stay inside the rounded coast (territories and their fades)
// only draws where the stencil is 1. That clips them to the coast on the GPU, whatever shape the polygons have.
import { AlwaysStencilFunc, EqualStencilFunc, KeepStencilOp, ReplaceStencilOp } from 'three';

export const writeFloorStencil = { stencilWrite: true, stencilRef: 1, stencilFunc: AlwaysStencilFunc, stencilFail: KeepStencilOp, stencilZFail: KeepStencilOp, stencilZPass: ReplaceStencilOp } as const;
export const clipToFloor = { stencilWrite: true, stencilRef: 1, stencilFunc: EqualStencilFunc, stencilFail: KeepStencilOp, stencilZFail: KeepStencilOp, stencilZPass: KeepStencilOp } as const;
