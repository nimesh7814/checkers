import { Piece, Position, Move, PieceColor, AIDifficulty, BoardSize } from '@/types/game';

export function createInitialBoard(size: BoardSize = 12): (Piece | null)[][] {
  const board: (Piece | null)[][] = Array.from({ length: size }, () =>
    Array(size).fill(null)
  );

  const pieceRows = size === 8 ? 3 : 5;
  const emptyRows = size === 8 ? 2 : 2;

  let id = 0;
  // Black pieces on top rows
  for (let row = 0; row < pieceRows; row++) {
    for (let col = 0; col < size; col++) {
      if ((row + col) % 2 === 1) {
        board[row][col] = { id: `b${id++}`, color: 'black', isKing: false, row, col };
      }
    }
  }
  // White pieces on bottom rows
  for (let row = size - pieceRows; row < size; row++) {
    for (let col = 0; col < size; col++) {
      if ((row + col) % 2 === 1) {
        board[row][col] = { id: `w${id++}`, color: 'white', isKing: false, row, col };
      }
    }
  }
  return board;
}

function isValidPos(row: number, col: number, size: number): boolean {
  return row >= 0 && row < size && col >= 0 && col < size;
}

function getCaptureMoves(
  board: (Piece | null)[][],
  piece: Piece,
  from: Position,
  size: number,
  captured: Position[] = []
): Move[] {
  const moves: Move[] = [];
  const directions = piece.isKing
    ? [[-1, -1], [-1, 1], [1, -1], [1, 1]]
    : piece.color === 'white'
      ? [[-1, -1], [-1, 1]]
      : [[1, -1], [1, 1]];

  if (piece.isKing) {
    // Kings can fly — scan diagonals for captures
    for (const [dr, dc] of directions) {
      let r = from.row + dr;
      let c = from.col + dc;
      while (isValidPos(r, c, size) && !board[r][c]) {
        r += dr;
        c += dc;
      }
      if (
        isValidPos(r, c, size) &&
        board[r][c] &&
        board[r][c]!.color !== piece.color &&
        !captured.some(cp => cp.row === r && cp.col === c)
      ) {
        const enemyPos = { row: r, col: c };
        let lr = r + dr;
        let lc = c + dc;
        while (isValidPos(lr, lc, size) && !board[lr][lc]) {
          const landPos = { row: lr, col: lc };
          const newCaptured = [...captured, enemyPos];
          const tempBoard = board.map(row => [...row]);
          tempBoard[from.row][from.col] = null;
          tempBoard[enemyPos.row][enemyPos.col] = null;
          const movedPiece = { ...piece, row: lr, col: lc };
          tempBoard[lr][lc] = movedPiece;

          const chain = getCaptureMoves(tempBoard, movedPiece, landPos, size, newCaptured);
          if (chain.length > 0) {
            moves.push(...chain);
          } else {
            moves.push({ from, to: landPos, captures: newCaptured, piece });
          }
          lr += dr;
          lc += dc;
        }
      }
    }
  } else {
    // Regular pieces — allow backward captures (international rules)
    const allDirs = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
    for (const [dr, dc] of allDirs) {
      const mr = from.row + dr;
      const mc = from.col + dc;
      const lr = from.row + 2 * dr;
      const lc = from.col + 2 * dc;

      if (
        isValidPos(mr, mc, size) &&
        isValidPos(lr, lc, size) &&
        board[mr][mc] &&
        board[mr][mc]!.color !== piece.color &&
        !board[lr][lc] &&
        !captured.some(cp => cp.row === mr && cp.col === mc)
      ) {
        const enemyPos = { row: mr, col: mc };
        const landPos = { row: lr, col: lc };
        const newCaptured = [...captured, enemyPos];

        const willPromote = (piece.color === 'white' && lr === 0) || (piece.color === 'black' && lr === size - 1);
        
        const tempBoard = board.map(row => [...row]);
        tempBoard[from.row][from.col] = null;
        tempBoard[enemyPos.row][enemyPos.col] = null;
        const movedPiece = { ...piece, row: lr, col: lc, isKing: piece.isKing || willPromote };
        tempBoard[lr][lc] = movedPiece;

        const chain = getCaptureMoves(tempBoard, movedPiece, landPos, size, newCaptured);
        if (chain.length > 0) {
          moves.push(...chain);
        } else {
          moves.push({ from, to: landPos, captures: newCaptured, piece });
        }
      }
    }
  }

  return moves;
}

function getSimpleMoves(board: (Piece | null)[][], piece: Piece, size: number): Move[] {
  const moves: Move[] = [];
  const from = { row: piece.row, col: piece.col };

  if (piece.isKing) {
    const directions = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
    for (const [dr, dc] of directions) {
      let r = from.row + dr;
      let c = from.col + dc;
      while (isValidPos(r, c, size) && !board[r][c]) {
        moves.push({ from, to: { row: r, col: c }, captures: [], piece });
        r += dr;
        c += dc;
      }
    }
  } else {
    const directions = piece.color === 'white' ? [[-1, -1], [-1, 1]] : [[1, -1], [1, 1]];
    for (const [dr, dc] of directions) {
      const r = from.row + dr;
      const c = from.col + dc;
      if (isValidPos(r, c, size) && !board[r][c]) {
        moves.push({ from, to: { row: r, col: c }, captures: [], piece });
      }
    }
  }
  return moves;
}

export function getAllValidMoves(board: (Piece | null)[][], color: PieceColor): Move[] {
  const size = board.length;
  const pieces: Piece[] = [];
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (board[r][c] && board[r][c]!.color === color) {
        pieces.push(board[r][c]!);
      }
    }
  }

  // Mandatory capture rule
  let allCaptures: Move[] = [];
  for (const piece of pieces) {
    const captures = getCaptureMoves(board, piece, { row: piece.row, col: piece.col }, size);
    allCaptures.push(...captures);
  }

  if (allCaptures.length > 0) {
    const maxCaptures = Math.max(...allCaptures.map(m => m.captures.length));
    return allCaptures.filter(m => m.captures.length === maxCaptures);
  }

  let allMoves: Move[] = [];
  for (const piece of pieces) {
    allMoves.push(...getSimpleMoves(board, piece, size));
  }
  return allMoves;
}

export function getMovesForPiece(board: (Piece | null)[][], piece: Piece): Move[] {
  const allMoves = getAllValidMoves(board, piece.color);
  return allMoves.filter(m => m.from.row === piece.row && m.from.col === piece.col);
}

export function executeMove(board: (Piece | null)[][], move: Move): (Piece | null)[][] {
  const size = board.length;
  const newBoard = board.map(row => [...row]);
  const piece = newBoard[move.from.row][move.from.col]!;

  newBoard[move.from.row][move.from.col] = null;
  for (const cap of move.captures) {
    newBoard[cap.row][cap.col] = null;
  }

  const promoted =
    !piece.isKing &&
    ((piece.color === 'white' && move.to.row === 0) ||
      (piece.color === 'black' && move.to.row === size - 1));

  newBoard[move.to.row][move.to.col] = {
    ...piece,
    row: move.to.row,
    col: move.to.col,
    isKing: piece.isKing || promoted,
  };

  return newBoard;
}

export function checkGameOver(board: (Piece | null)[][], currentTurn: PieceColor): PieceColor | 'draw' | null {
  const moves = getAllValidMoves(board, currentTurn);
  if (moves.length === 0) {
    return currentTurn === 'white' ? 'black' : 'white';
  }
  return null;
}

export function posToNotation(pos: Position, size: number = 12): string {
  const col = String.fromCharCode(65 + pos.col);
  return `${col}${size - pos.row}`;
}

export function moveToNotation(move: Move, size: number = 12): string {
  const from = posToNotation(move.from, size);
  const to = posToNotation(move.to, size);
  const sep = move.captures.length > 0 ? 'x' : '-';
  return `${from}${sep}${to}`;
}

// AI logic
export function getAIMove(board: (Piece | null)[][], color: PieceColor, difficulty: AIDifficulty): Move | null {
  const size = board.length;
  const moves = getAllValidMoves(board, color);
  if (moves.length === 0) return null;

  const center = (size - 1) / 2;
  const lastRow = size - 1;

  switch (difficulty) {
    case 'easy':
      return moves[Math.floor(Math.random() * moves.length)];

    case 'moderate': {
      const captures = moves.filter(m => m.captures.length > 0);
      if (captures.length > 0) {
        return captures[Math.floor(Math.random() * captures.length)];
      }
      const kingMoves = moves.filter(m => m.piece.isKing);
      if (kingMoves.length > 0 && Math.random() > 0.3) {
        return kingMoves[Math.floor(Math.random() * kingMoves.length)];
      }
      return moves[Math.floor(Math.random() * moves.length)];
    }

    case 'hard': {
      let bestScore = -Infinity;
      let bestMove = moves[0];
      for (const move of moves) {
        let score = move.captures.length * 10;
        const centerDist = Math.abs(move.to.row - center) + Math.abs(move.to.col - center);
        score -= centerDist;
        if (!move.piece.isKing) {
          if (color === 'black' && move.to.row === lastRow) score += 15;
          if (color === 'white' && move.to.row === 0) score += 15;
        }
        if (move.to.col === 0 || move.to.col === lastRow) score -= 2;
        const newBoard = executeMove(board, move);
        const opponentColor = color === 'white' ? 'black' : 'white';
        const opponentMoves = getAllValidMoves(newBoard, opponentColor);
        const opponentCaptures = opponentMoves.filter(m => m.captures.length > 0);
        score -= opponentCaptures.reduce((s, m) => s + m.captures.length * 5, 0);

        if (score > bestScore) {
          bestScore = score;
          bestMove = move;
        }
      }
      return bestMove;
    }
  }
}
