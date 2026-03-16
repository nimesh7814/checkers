import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import CheckerBoard from '@/components/CheckerBoard';
import PlayerAvatar from '@/components/PlayerAvatar';
import { Button } from '@/components/ui/button';
import {
  createInitialBoard, getAllValidMoves, getMovesForPiece, getCaptureMovesForPiece,
  executeMove, checkGameOver, moveToNotation, getAIMove, getAIMoveFromMoves,
} from '@/lib/checkers';
import { saveMatch } from '@/lib/matchHistory';
import { Piece, Position, Move, PieceColor, BoardTheme, BoardSize, AIDifficulty, MoveRecord, MatchRecord } from '@/types/game';
import CountryFlag from '@/components/CountryFlag';
import { Crown, Flag, ArrowLeft, Handshake, RotateCcw } from 'lucide-react';
import { playMoveSound, playCaptureSound, playKingSound, playGameOverSound, setSoundEnabled } from '@/lib/sounds';
import { useToast } from '@/hooks/use-toast';

const GamePage: React.FC = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as {
    gameType: 'ai' | 'multiplayer';
    aiDifficulty?: AIDifficulty;
    playerColor: PieceColor;
    boardTheme: BoardTheme;
    boardSize?: BoardSize;
  } | null;

  const gameType = state?.gameType ?? 'ai';
  const aiDifficulty = state?.aiDifficulty ?? 'moderate';
  const playerColor = state?.playerColor ?? 'white';
  const boardTheme = state?.boardTheme ?? 'classic';
  const boardSize: BoardSize = state?.boardSize ?? 12;
  const aiColor: PieceColor = playerColor === 'white' ? 'black' : 'white';

  const [board, setBoard] = useState(() => createInitialBoard(boardSize));
  const [currentTurn, setCurrentTurn] = useState<PieceColor>('white');
  const [selectedPiece, setSelectedPiece] = useState<Position | null>(null);
  const [validMoves, setValidMoves] = useState<Move[]>([]);
  const [moveHistory, setMoveHistory] = useState<string[]>([]);
  const [capturedWhite, setCapturedWhite] = useState(0);
  const [capturedBlack, setCapturedBlack] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [winner, setWinner] = useState<PieceColor | 'draw' | null>(null);
  const [timer, setTimer] = useState({ white: 600, black: 600 });
  const [forcedContinuationPiece, setForcedContinuationPiece] = useState<Position | null>(null);
  const [redirecting, setRedirecting] = useState(false);
  const [matchSaved, setMatchSaved] = useState(false);
  const gameStartTime = useRef(Date.now());

  // Sync sound preference
  useEffect(() => {
    setSoundEnabled(user?.preferences?.soundEnabled ?? true);
  }, [user?.preferences?.soundEnabled]);

  useEffect(() => {
    if (!state || !user) {
      setRedirecting(true);
      navigate('/dashboard');
    }
  }, [state, user, navigate]);

  // Timer
  useEffect(() => {
    if (gameOver) return;
    const interval = setInterval(() => {
      setTimer(prev => {
        const updated = { ...prev, [currentTurn]: prev[currentTurn] - 1 };
        if (updated[currentTurn] <= 0) {
          setGameOver(true);
          setWinner(currentTurn === 'white' ? 'black' : 'white');
        }
        return updated;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [currentTurn, gameOver]);

  // Save match when game ends
  useEffect(() => {
    if (gameOver && !matchSaved && user) {
      setMatchSaved(true);
      const duration = Math.round((Date.now() - gameStartTime.current) / 1000);
      const playerCaptured = playerColor === 'white' ? capturedBlack : capturedWhite;
      const opponentCaptured = playerColor === 'white' ? capturedWhite : capturedBlack;
      const result: 'win' | 'loss' | 'draw' = winner === 'draw' ? 'draw' : winner === playerColor ? 'win' : 'loss';
      const match: MatchRecord = {
        id: crypto.randomUUID(),
        date: new Date().toISOString(),
        gameType,
        boardTheme,
        playerColor,
        playerUsername: user.username,
        opponentName: gameType === 'ai' ? `AI (${aiDifficulty})` : 'Opponent',
        aiDifficulty: gameType === 'ai' ? aiDifficulty : undefined,
        moves: moveHistory,
        result,
        winner,
        duration,
        capturedByPlayer: playerCaptured,
        capturedByOpponent: opponentCaptured,
      };
      saveMatch(user.id, match);
    }
  }, [gameOver, matchSaved, user, winner]);

  const applyMove = useCallback((move: Move) => {
    const newBoard = executeMove(board, move);
    setBoard(newBoard);

    // Check if piece got promoted to king
    const landedPiece = newBoard[move.to.row]?.[move.to.col];
    const wasPromoted = landedPiece?.isKing && !move.piece.isKing;

    if (move.captures.length > 0) {
      if (move.piece.color === 'white') {
        setCapturedBlack(prev => prev + move.captures.length);
      } else {
        setCapturedWhite(prev => prev + move.captures.length);
      }
    }

    // Play sound effects
    if (wasPromoted) {
      playKingSound();
    } else if (move.captures.length > 0) {
      playCaptureSound();
    } else {
      playMoveSound();
    }

    setMoveHistory(prev => [...prev, moveToNotation(move, boardSize)]);

    if (move.captures.length > 0 && landedPiece) {
      const followUpMoves = getCaptureMovesForPiece(newBoard, landedPiece);

      if (followUpMoves.length > 0) {
        const nextPosition = { row: landedPiece.row, col: landedPiece.col };
        setForcedContinuationPiece(nextPosition);
        setSelectedPiece(nextPosition);
        setValidMoves(followUpMoves);
        return;
      }
    }

    setForcedContinuationPiece(null);
    setSelectedPiece(null);
    setValidMoves([]);

    const nextTurn = currentTurn === 'white' ? 'black' : 'white';
    const result = checkGameOver(newBoard, nextTurn);
    if (result) {
      setGameOver(true);
      setWinner(result);
      setTimeout(() => {
        playGameOverSound(result === playerColor);
      }, 300);
    } else {
      setCurrentTurn(nextTurn);
    }
  }, [board, boardSize, currentTurn, playerColor]);

  const allCurrentTurnMoves = useMemo((): Move[] => {
    if (gameOver) return [];
    if (forcedContinuationPiece) {
      const continuedPiece = board[forcedContinuationPiece.row]?.[forcedContinuationPiece.col];
      if (!continuedPiece || continuedPiece.color !== currentTurn) {
        return [];
      }

      return getCaptureMovesForPiece(board, continuedPiece);
    }
    return getAllValidMoves(board, currentTurn);
  }, [board, currentTurn, forcedContinuationPiece, gameOver]);

  // AI move
  useEffect(() => {
    if (gameType === 'ai' && currentTurn === aiColor && !gameOver) {
      const timeout = setTimeout(() => {
        const move = forcedContinuationPiece
          ? getAIMoveFromMoves(board, aiColor, aiDifficulty, allCurrentTurnMoves)
          : getAIMove(board, aiColor, aiDifficulty);

        if (move) {
          const firstStep = move.sequence?.[0];
          if (firstStep && move.captures.length > 0) {
            applyMove({
              from: move.from,
              to: firstStep.to,
              captures: [firstStep.capture],
              piece: move.piece,
              sequence: [firstStep],
            });
            return;
          }

          applyMove(move);
        }
      }, 500 + Math.random() * 500);
      return () => clearTimeout(timeout);
    }
  }, [aiColor, aiDifficulty, allCurrentTurnMoves, applyMove, board, currentTurn, forcedContinuationPiece, gameOver, gameType]);

  // Compute which pieces can move (for visual hints)
  const movablePieces = useMemo((): Position[] => {
    const positions = new Map<string, Position>();
    for (const move of allCurrentTurnMoves) {
      const key = `${move.from.row},${move.from.col}`;
      if (!positions.has(key)) {
        positions.set(key, { row: move.from.row, col: move.from.col });
      }
    }
    return Array.from(positions.values());
  }, [allCurrentTurnMoves]);

  const captureMoves = useMemo(() => {
    return allCurrentTurnMoves.filter(move => move.captures.length > 0);
  }, [allCurrentTurnMoves]);

  const hasMandatoryCapture = captureMoves.length > 0;

  const forcedCapturePieces = useMemo((): Position[] => {
    const positions = new Map<string, Position>();

    for (const move of captureMoves) {
      const key = `${move.from.row},${move.from.col}`;
      if (!positions.has(key)) {
        positions.set(key, { row: move.from.row, col: move.from.col });
      }
    }

    return Array.from(positions.values());
  }, [captureMoves]);

  // Green target dots: show all valid moves for the selected piece
  const boardHintMoves = useMemo(() => {
    if (!selectedPiece) return [];

    if (validMoves.some(move => move.captures.length > 0)) {
      const firstStepTargets = new Map<string, Move>();

      for (const move of validMoves) {
        const firstStep = move.sequence?.[0];
        if (!firstStep) continue;

        const key = `${firstStep.to.row},${firstStep.to.col}`;
        if (!firstStepTargets.has(key)) {
          firstStepTargets.set(key, {
            from: move.from,
            to: firstStep.to,
            captures: [firstStep.capture],
            piece: move.piece,
            sequence: [firstStep],
          });
        }
      }

      return Array.from(firstStepTargets.values());
    }

    return validMoves;
  }, [selectedPiece, validMoves]);

  // Before selection, only the pieces that must capture are highlighted
  const visibleMovablePieces = useMemo(() => {
    if (selectedPiece || !hasMandatoryCapture) return [];
    return forcedCapturePieces;
  }, [selectedPiece, hasMandatoryCapture, forcedCapturePieces]);

  const trySelectPiece = useCallback((piece: Piece) => {
    const moves = getMovesForPiece(board, piece);
    if (moves.length === 0) return false;

    setSelectedPiece({ row: piece.row, col: piece.col });
    setValidMoves(moves);
    return true;
  }, [board]);

  const revealMandatoryCapture = useCallback(() => {
    if (forcedCapturePieces.length === 0) return;

    if (forcedCapturePieces.length === 1) {
      const forcedPos = forcedCapturePieces[0];
      const forcedPiece = board[forcedPos.row]?.[forcedPos.col];
      if (!forcedPiece) return;

      trySelectPiece(forcedPiece);
      toast({
        title: 'Capture required',
        description: 'Pick a green landing square to complete the capture sequence.',
        duration: 2400,
      });
      return;
    }

    setSelectedPiece(null);
    setValidMoves([]);
    toast({
      title: 'Capture required',
      description: 'Select one of the highlighted pieces first.',
      duration: 2400,
    });
  }, [forcedCapturePieces, board, trySelectPiece, toast]);

  const handleSquareClick = useCallback((row: number, col: number) => {
    if (gameOver) return;
    if (gameType === 'ai' && currentTurn === aiColor) return;

    const piece = board[row][col];

    if (selectedPiece) {
      const hasCaptureSequence = validMoves.some(move => move.captures.length > 0);
      const move = hasCaptureSequence
        ? (() => {
            const candidate = validMoves.find(candidateMove => {
              const firstStep = candidateMove.sequence?.[0];
              return firstStep?.to.row === row && firstStep.to.col === col;
            });

            const firstStep = candidate?.sequence?.[0];
            if (!candidate || !firstStep) {
              return undefined;
            }

            return {
              from: candidate.from,
              to: firstStep.to,
              captures: [firstStep.capture],
              piece: candidate.piece,
              sequence: [firstStep],
            } satisfies Move;
          })()
        : validMoves.find(m => m.to.row === row && m.to.col === col);

      if (move) {
        applyMove(move);
        return;
      }

      if (piece && piece.color === currentTurn) {
        if (!trySelectPiece(piece)) {
          if (hasMandatoryCapture) {
            revealMandatoryCapture();
          } else {
            setSelectedPiece(null);
            setValidMoves([]);
          }
        }
        return;
      }

      if (hasMandatoryCapture) {
        revealMandatoryCapture();
        return;
      }

      setSelectedPiece(null);
      setValidMoves([]);
      return;
    }

    if (piece && piece.color === currentTurn) {
      if (!trySelectPiece(piece) && hasMandatoryCapture) {
        revealMandatoryCapture();
      }
      return;
    }

    if (hasMandatoryCapture) {
      revealMandatoryCapture();
    }
  }, [board, selectedPiece, validMoves, currentTurn, gameOver, gameType, aiColor, applyMove, hasMandatoryCapture, revealMandatoryCapture, trySelectPiece]);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  const resign = () => {
    setGameOver(true);
    setWinner(playerColor === 'white' ? 'black' : 'white');
  };

  const resetGame = () => {
    setBoard(createInitialBoard(boardSize));
    setCurrentTurn('white');
    setSelectedPiece(null);
    setValidMoves([]);
    setForcedContinuationPiece(null);
    setMoveHistory([]);
    setCapturedWhite(0);
    setCapturedBlack(0);
    setGameOver(false);
    setWinner(null);
    setTimer({ white: 600, black: 600 });
  };

  if (redirecting || !user) return null;

  const userCountryCode = user.countryCode;
  const isFlipped = playerColor === 'black';

  const PlayerCard: React.FC<{
    name: string; flag: React.ReactNode; avatar: string | null; color: PieceColor;
    timeLeft: number; captured: number; isCurrentTurn: boolean;
  }> = ({ name, flag, avatar, color, timeLeft, captured, isCurrentTurn }) => (
    <div className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors shrink-0 ${
      isCurrentTurn ? 'bg-accent border border-primary/30' : 'bg-card'
    }`}>
      <PlayerAvatar username={name} src={avatar} size={32} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-medium text-foreground truncate">{name}</span>
          <span>{flag}</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <div className={`w-2.5 h-2.5 rounded-full ${color === 'white' ? 'bg-neutral-200' : 'bg-neutral-800 border border-border'}`} />
          <span>Captured: {captured}</span>
        </div>
      </div>
      <div className={`font-mono text-base tabular-nums font-bold ${
        timeLeft <= 30 ? 'text-destructive' : 'text-foreground'
      }`}>
        {formatTime(timeLeft)}
      </div>
    </div>
  );

  return (
    <div className="h-[100dvh] bg-background flex flex-col overflow-hidden">
      {/* Header */}
      <header className="border-b border-border bg-card px-3 py-1.5 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate('/dashboard')}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <Crown className="w-4 h-4 text-primary" />
          <span className="text-sm font-medium text-foreground">
            {gameType === 'ai' ? `vs AI (${aiDifficulty})` : 'vs Player'}
          </span>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="capitalize">{boardTheme}</span>
          <span>·</span>
          <span>{currentTurn === playerColor ? 'Your Turn' : "Opponent's Turn"}</span>
        </div>
      </header>

      {/* Main content */}
      <div className="flex-1 flex flex-col lg:flex-row min-h-0 overflow-hidden">
        {/* LEFT: Board section */}
        <div className="flex-1 flex flex-col min-h-0 min-w-0 overflow-y-auto lg:overflow-hidden">
          {/* Opponent card - visible on mobile above board */}
          <div className="p-2 shrink-0 lg:hidden">
            <PlayerCard
              name={gameType === 'ai' ? `AI (${aiDifficulty})` : 'Opponent'}
              flag={gameType === 'ai' ? '🤖' : '🌍'}
              avatar={null}
              color={aiColor}
              timeLeft={timer[aiColor]}
              captured={aiColor === 'white' ? capturedBlack : capturedWhite}
              isCurrentTurn={currentTurn === aiColor}
            />
          </div>

          {/* Board */}
          <div className="shrink-0 lg:flex-1 lg:min-h-0 flex items-center justify-center p-2 lg:p-4">
            <CheckerBoard
              board={board}
              theme={boardTheme}
              boardSize={boardSize}
              selectedPiece={selectedPiece}
              validMoves={boardHintMoves}
              movablePieces={visibleMovablePieces}
              onSquareClick={handleSquareClick}
              flipped={isFlipped}
            />
          </div>

          {/* Player card - visible on mobile below board */}
          <div className="p-2 shrink-0 lg:hidden">
            <PlayerCard
              name={user.username}
              flag={<CountryFlag code={userCountryCode} className="h-4 w-6" title={user.country} />}
              avatar={user.avatar}
              color={playerColor}
              timeLeft={timer[playerColor]}
              captured={playerColor === 'white' ? capturedBlack : capturedWhite}
              isCurrentTurn={currentTurn === playerColor}
            />
          </div>

          {/* Panels below board on mobile */}
          <div className="lg:hidden shrink-0 space-y-0 border-t border-border">
            {/* Game Over */}
            {gameOver && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="m-2 p-3 text-center border border-primary/30 rounded-lg bg-primary/5"
              >
                <Crown className="w-6 h-6 text-primary mx-auto mb-1" />
                <h3 className="font-bold text-foreground">
                  {winner === 'draw' ? 'Draw!' : winner === playerColor ? 'You Win!' : 'You Lose!'}
                </h3>
                <Button onClick={resetGame} className="mt-2 w-full" size="sm">
                  <RotateCcw className="w-3 h-3 mr-1" /> Play Again
                </Button>
              </motion.div>
            )}

            <div className="p-3 border-b border-border">
              <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Game Info</h4>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div className="text-center">
                  <span className="text-muted-foreground block">Mode</span>
                  <span className="text-foreground font-medium">{gameType === 'ai' ? `AI (${aiDifficulty})` : 'Player'}</span>
                </div>
                <div className="text-center">
                  <span className="text-muted-foreground block">Theme</span>
                  <span className="text-foreground font-medium capitalize">{boardTheme}</span>
                </div>
                <div className="text-center">
                  <span className="text-muted-foreground block">Turn</span>
                  <span className={`font-medium ${currentTurn === playerColor ? 'text-primary' : 'text-foreground'}`}>
                    {currentTurn === playerColor ? 'Yours' : 'Opponent'}
                  </span>
                </div>
              </div>
            </div>

            <div className="p-3 border-b border-border">
              <div className="flex gap-1.5">
                <Button variant="outline" size="sm" className="flex-1 text-xs h-8" onClick={resign} disabled={gameOver}>
                  <Flag className="w-3 h-3 mr-1" /> Resign
                </Button>
                <Button variant="outline" size="sm" className="flex-1 text-xs h-8" disabled={gameOver}>
                  <Handshake className="w-3 h-3 mr-1" /> Draw
                </Button>
                <Button variant="outline" size="sm" className="flex-1 text-xs h-8" onClick={() => navigate('/dashboard')}>
                  <ArrowLeft className="w-3 h-3 mr-1" /> Back
                </Button>
              </div>
            </div>

            <div className="p-3">
              <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Move History</h4>
              <div className="space-y-0.5 max-h-32 overflow-y-auto font-mono text-xs">
                {moveHistory.length === 0 ? (
                  <p className="text-muted-foreground text-xs">No moves yet</p>
                ) : (
                  moveHistory.map((move, i) => (
                    <div key={i} className="flex items-center gap-2 py-0.5">
                      <span className="text-muted-foreground w-5 text-right tabular-nums">{i + 1}.</span>
                      <span className="text-foreground">{move}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT sidebar - only visible on lg+ */}
        <div className="hidden lg:flex lg:w-72 xl:w-80 shrink-0 border-l border-border bg-card/50 flex-col min-h-0 overflow-y-auto">
          {/* Opponent Player Card */}
          <div className="p-2 border-b border-border">
            <PlayerCard
              name={gameType === 'ai' ? `AI (${aiDifficulty})` : 'Opponent'}
              flag={gameType === 'ai' ? '🤖' : '🌍'}
              avatar={null}
              color={aiColor}
              timeLeft={timer[aiColor]}
              captured={aiColor === 'white' ? capturedBlack : capturedWhite}
              isCurrentTurn={currentTurn === aiColor}
            />
          </div>

          {/* Your Player Card */}
          <div className="p-2 border-b border-border">
            <PlayerCard
              name={user.username}
              flag={<CountryFlag code={userCountryCode} className="h-4 w-6" title={user.country} />}
              avatar={user.avatar}
              color={playerColor}
              timeLeft={timer[playerColor]}
              captured={playerColor === 'white' ? capturedBlack : capturedWhite}
              isCurrentTurn={currentTurn === playerColor}
            />
          </div>

          {/* Game Over */}
          {gameOver && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="m-2 p-3 text-center border border-primary/30 rounded-lg bg-primary/5"
            >
              <Crown className="w-6 h-6 text-primary mx-auto mb-1" />
              <h3 className="font-bold text-foreground">
                {winner === 'draw' ? 'Draw!' : winner === playerColor ? 'You Win!' : 'You Lose!'}
              </h3>
              <Button onClick={resetGame} className="mt-2 w-full" size="sm">
                <RotateCcw className="w-3 h-3 mr-1" /> Play Again
              </Button>
            </motion.div>
          )}

          {/* Game Info */}
          <div className="p-3 border-b border-border">
            <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Game Info</h4>
            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Mode</span>
                <span className="text-foreground font-medium">{gameType === 'ai' ? `vs AI (${aiDifficulty})` : 'vs Player'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Theme</span>
                <span className="text-foreground font-medium capitalize">{boardTheme}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Turn</span>
                <span className={`font-medium ${currentTurn === playerColor ? 'text-primary' : 'text-foreground'}`}>
                  {currentTurn === playerColor ? 'Your Turn' : "Opponent's Turn"}
                </span>
              </div>
            </div>
          </div>

          {/* Controls */}
          <div className="p-3 border-b border-border space-y-1.5">
            <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Controls</h4>
            <div className="flex gap-1.5">
              <Button variant="outline" size="sm" className="flex-1 text-xs h-8" onClick={resign} disabled={gameOver}>
                <Flag className="w-3 h-3 mr-1" /> Resign
              </Button>
              <Button variant="outline" size="sm" className="flex-1 text-xs h-8" disabled={gameOver}>
                <Handshake className="w-3 h-3 mr-1" /> Draw
              </Button>
            </div>
            <Button variant="outline" size="sm" className="w-full text-xs h-8" onClick={() => navigate('/dashboard')}>
              <ArrowLeft className="w-3 h-3 mr-1" /> Back to Dashboard
            </Button>
          </div>

          {/* Move History */}
          <div className="p-3 flex-1 min-h-0">
            <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Move History</h4>
            <div className="space-y-0.5 overflow-y-auto max-h-none font-mono text-xs">
              {moveHistory.length === 0 ? (
                <p className="text-muted-foreground text-xs">No moves yet</p>
              ) : (
                moveHistory.map((move, i) => (
                  <div key={i} className="flex items-center gap-2 py-0.5">
                    <span className="text-muted-foreground w-5 text-right tabular-nums">{i + 1}.</span>
                    <span className="text-foreground">{move}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GamePage;
