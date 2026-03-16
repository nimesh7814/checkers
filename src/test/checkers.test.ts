import { describe, expect, it } from 'vitest';

import { executeMove, getCaptureMovesForPiece, getMovesForPiece } from '@/lib/checkers';
import { Move, Piece } from '@/types/game';

function createBoard(size = 8): (Piece | null)[][] {
  return Array.from({ length: size }, () => Array(size).fill(null));
}

describe('checkers chained captures', () => {
  it('keeps the same piece active until the capture sequence is complete', () => {
    const board = createBoard();
    const whitePiece: Piece = { id: 'w1', color: 'white', isKing: false, row: 5, col: 0 };
    const firstBlackPiece: Piece = { id: 'b1', color: 'black', isKing: false, row: 4, col: 1 };
    const secondBlackPiece: Piece = { id: 'b2', color: 'black', isKing: false, row: 2, col: 3 };

    board[5][0] = whitePiece;
    board[4][1] = firstBlackPiece;
    board[2][3] = secondBlackPiece;

    const openingMoves = getMovesForPiece(board, whitePiece);

    expect(openingMoves).toHaveLength(1);
    expect(openingMoves[0].captures).toEqual([
      { row: 4, col: 1 },
      { row: 2, col: 3 },
    ]);
    expect(openingMoves[0].sequence).toEqual([
      { to: { row: 3, col: 2 }, capture: { row: 4, col: 1 } },
      { to: { row: 1, col: 4 }, capture: { row: 2, col: 3 } },
    ]);

    const firstStep = openingMoves[0].sequence?.[0];
    expect(firstStep).toBeDefined();

    const firstStepMove: Move = {
      from: openingMoves[0].from,
      to: firstStep!.to,
      captures: [firstStep!.capture],
      piece: whitePiece,
      sequence: [firstStep!],
    };

    const boardAfterFirstCapture = executeMove(board, firstStepMove);
    const continuedPiece = boardAfterFirstCapture[3][2];

    expect(continuedPiece).toMatchObject({ color: 'white', row: 3, col: 2 });

    const followUpMoves = getCaptureMovesForPiece(boardAfterFirstCapture, continuedPiece!);

    expect(followUpMoves).toHaveLength(1);
    expect(followUpMoves[0].from).toEqual({ row: 3, col: 2 });
    expect(followUpMoves[0].sequence).toEqual([
      { to: { row: 1, col: 4 }, capture: { row: 2, col: 3 } },
    ]);
  });
});