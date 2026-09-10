// Logical cell coordinates remain the input to the original movement rules.
// The concept scene gives each step twice the previous physical spacing.
export const CELL_SIZE=2;
export const MODEL_SCALE=1.8;
export const HEAD_SCALE=2.1;
export const PLAYER_SCALE=2.1;
// A physical envelope for the larger heads and articulated armor plates.
// The narrowest wall-to-wall passage is 2.70 units across.
export const MAX_ACTOR_RADIUS=1.10;
export const WALL_WIDTH=1.30;
export const WALL_HEIGHT=1.12;
export const DEFAULT_TILT=55;
export const DEFAULT_ZOOM=1.5;
export const DEFAULT_PROJECTION=.5;
export function worldLayout(maze){
  const rows=maze.length,cols=maze[0].length;
  return {
    cols,rows,width:cols*CELL_SIZE,height:rows*CELL_SIZE,
    x:(value)=>(value-(cols-1)/2)*CELL_SIZE,
    z:(value)=>(value-(rows-1)/2)*CELL_SIZE
  };
}
