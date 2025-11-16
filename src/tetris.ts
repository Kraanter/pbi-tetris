type Vec2 = { x: number; y: number };
export type PieceType = "I" | "O" | "T" | "S" | "Z" | "J" | "L";

interface BlockOffset extends Vec2 {}

interface PieceTemplate {
    type: PieceType;
    blocks: BlockOffset[];
    color: number; // 1..7
}

interface ActivePiece {
    type: PieceType;
    blocks: BlockOffset[];
    color: number;
    position: Vec2; // top-left-ish origin in grid coords
}

export class TetrisGame {
    public readonly width: number = 10;
    public readonly height: number = 20;

    private grid: number[][]; // [y][x]
    private pieceTemplates: PieceTemplate[];
    private currentPiece: ActivePiece | null = null;
    private nextPiece: ActivePiece | null = null;
    private gameOver: boolean = false;
    private score: number = 0;
    private totalLinesCleared: number = 0;
    private spawnCounts: Record<PieceType, number> = {
        I: 0,
        O: 0,
        T: 0,
        S: 0,
        Z: 0,
        J: 0,
        L: 0,
    };

    constructor() {
        this.grid = this.createEmptyGrid();
        this.pieceTemplates = this.createPieceTemplates();
        this.nextPiece = this.createRandomPiece();
        this.spawnNextPiece();
    }

    // --- Public API ---------------------------------------------------------

    /** Advance the game one tick (gravity step). */
    public tick(): void {
        if (this.gameOver || !this.currentPiece) return;

        const newPos: Vec2 = {
            x: this.currentPiece.position.x,
            y: this.currentPiece.position.y + 1,
        };

        if (this.canPieceExist(this.currentPiece.blocks, newPos)) {
            this.currentPiece.position = newPos;
        } else {
            // Lock piece into the grid and spawn a new one
            this.lockCurrentPiece();
            const linesCleared = this.clearFullLines();
            this.addScore(linesCleared);
            this.spawnNextPiece();
        }
    }

    /** Move active piece left. */
    public moveLeft(): void {
        this.tryMove(-1, 0);
    }

    /** Move active piece right. */
    public moveRight(): void {
        this.tryMove(1, 0);
    }

    /** Soft drop (manual down). */
    public softDrop(): void {
        this.tryMove(0, 1);
    }

    /** Hard drop: instantly drop to the bottom and lock. */
    public hardDrop(): void {
        if (this.gameOver || !this.currentPiece) return;

        while (
            this.canPieceExist(this.currentPiece.blocks, {
                x: this.currentPiece.position.x,
                y: this.currentPiece.position.y + 1,
            })
        ) {
            this.currentPiece.position.y++;
        }

        this.lockCurrentPiece();
        const linesCleared = this.clearFullLines();
        this.addScore(linesCleared);
        this.spawnNextPiece();
    }

    /** Rotate the piece 90° clockwise (simple rotation, no wall-kick). */
    public rotate(): void {
        if (this.gameOver || !this.currentPiece) return;

        const rotatedBlocks = this.currentPiece.blocks.map((b) => ({
            x: -b.y,
            y: b.x,
        }));

        if (this.canPieceExist(rotatedBlocks, this.currentPiece.position)) {
            this.currentPiece.blocks = rotatedBlocks;
        }
    }

    /** Returns a copy of the board with the current falling piece drawn in. */
    public getBoardWithCurrentPiece(): number[][] {
        const board = this.grid.map((row) => [...row]); // deep-ish copy

        if (!this.currentPiece) return board;

        for (const block of this.currentPiece.blocks) {
            const x = this.currentPiece.position.x + block.x;
            const y = this.currentPiece.position.y + block.y;

            if (x >= 0 && x < this.width && y >= 0 && y < this.height) {
                board[y][x] = this.currentPiece.color;
            }
        }

        return board;
    }

    /** Returns whether the game is over. */
    public isGameOver(): boolean {
        return this.gameOver;
    }

    /** Returns current score. */
    public getScore(): number {
        return this.score;
    }

    /** Returns total rows cleared in this run. */
    public getTotalLinesCleared(): number {
        return this.totalLinesCleared;
    }

    /** Returns piece spawn count per piece type in this run. */
    public getSpawnCounts(): Record<PieceType, number> {
        return { ...this.spawnCounts };
    }

    /** Returns the next piece type that will spawn. */
    public getNextPieceType(): PieceType | null {
        return this.nextPiece?.type ?? null;
    }

    /** Reset game to a fresh state. */
    public reset(): void {
        this.grid = this.createEmptyGrid();
        this.gameOver = false;
        this.score = 0;
        this.totalLinesCleared = 0;
        this.spawnCounts = {
            I: 0,
            O: 0,
            T: 0,
            S: 0,
            Z: 0,
            J: 0,
            L: 0,
        };
        this.currentPiece = null;
        this.nextPiece = this.createRandomPiece();
        this.spawnNextPiece();
    }

    // --- Internal helpers ---------------------------------------------------

    private createEmptyGrid(): number[][] {
        return Array.from({ length: this.height }, () =>
            Array(this.width).fill(0)
        );
    }

    private createPieceTemplates(): PieceTemplate[] {
        // Coordinates are relative to the piece origin.
        // Color ids: 1..7
        return [
            // I
            {
                type: "I",
                color: 1,
                blocks: [
                    { x: -1, y: 0 },
                    { x: 0, y: 0 },
                    { x: 1, y: 0 },
                    { x: 2, y: 0 },
                ],
            },
            // O
            {
                type: "O",
                color: 2,
                blocks: [
                    { x: 0, y: 0 },
                    { x: 1, y: 0 },
                    { x: 0, y: 1 },
                    { x: 1, y: 1 },
                ],
            },
            // T
            {
                type: "T",
                color: 3,
                blocks: [
                    { x: -1, y: 0 },
                    { x: 0, y: 0 },
                    { x: 1, y: 0 },
                    { x: 0, y: 1 },
                ],
            },
            // S
            {
                type: "S",
                color: 4,
                blocks: [
                    { x: 0, y: 0 },
                    { x: 1, y: 0 },
                    { x: -1, y: 1 },
                    { x: 0, y: 1 },
                ],
            },
            // Z
            {
                type: "Z",
                color: 5,
                blocks: [
                    { x: -1, y: 0 },
                    { x: 0, y: 0 },
                    { x: 0, y: 1 },
                    { x: 1, y: 1 },
                ],
            },
            // J
            {
                type: "J",
                color: 6,
                blocks: [
                    { x: -1, y: 0 },
                    { x: 0, y: 0 },
                    { x: 1, y: 0 },
                    { x: -1, y: 1 },
                ],
            },
            // L
            {
                type: "L",
                color: 7,
                blocks: [
                    { x: -1, y: 0 },
                    { x: 0, y: 0 },
                    { x: 1, y: 0 },
                    { x: 1, y: 1 },
                ],
            },
        ];
    }

    private createRandomPiece(): ActivePiece {
        // Use crypto.getRandomValues to generate a random index
        const array = new Uint32Array(1);
        window.crypto.getRandomValues(array);

        const index = array[0] % this.pieceTemplates.length;
        const template = this.pieceTemplates[index];

        // Copy blocks so templates remain immutable
        const blocks = template.blocks.map((b) => ({ ...b }));

        return {
            type: template.type,
            blocks,
            color: template.color,
            position: { x: Math.floor(this.width / 2), y: -2 }, // start slightly above the board
        };
    }

    private spawnNextPiece(): void {
        if (!this.nextPiece) {
            this.nextPiece = this.createRandomPiece();
        }

        this.currentPiece = this.nextPiece;
        this.spawnCounts[this.currentPiece.type] += 1;
        // Reset position when spawning
        this.currentPiece.position = {
            x: Math.floor(this.width / 2),
            y: -2,
        };

        this.nextPiece = this.createRandomPiece();

        if (
            !this.canPieceExist(
                this.currentPiece.blocks,
                this.currentPiece.position
            )
        ) {
            this.gameOver = true;
        }
    }

    private tryMove(dx: number, dy: number): void {
        if (this.gameOver || !this.currentPiece) return;

        const newPos: Vec2 = {
            x: this.currentPiece.position.x + dx,
            y: this.currentPiece.position.y + dy,
        };

        if (this.canPieceExist(this.currentPiece.blocks, newPos)) {
            this.currentPiece.position = newPos;
        }
    }

    private canPieceExist(blocks: BlockOffset[], position: Vec2): boolean {
        for (const block of blocks) {
            const x = position.x + block.x;
            const y = position.y + block.y;

            // Allow y < 0 (piece spawning above top), but not out of x-bounds or below bottom
            if (x < 0 || x >= this.width || y >= this.height) {
                return false;
            }

            if (y >= 0 && this.grid[y][x] !== 0) {
                return false;
            }
        }
        return true;
    }

    private lockCurrentPiece(): void {
        if (!this.currentPiece) return;

        for (const block of this.currentPiece.blocks) {
            const x = this.currentPiece.position.x + block.x;
            const y = this.currentPiece.position.y + block.y;

            if (y < 0) {
                // Piece is locked above the visible area = game over
                this.gameOver = true;
                continue;
            }

            if (x >= 0 && x < this.width && y >= 0 && y < this.height) {
                this.grid[y][x] = this.currentPiece.color;
            }
        }
    }

    private clearFullLines(): number {
        const newGrid: number[][] = [];
        let linesCleared = 0;

        for (let y = 0; y < this.height; y++) {
            const row = this.grid[y];
            const isFull = row.every((cell) => cell !== 0);

            if (isFull) {
                linesCleared++;
            } else {
                newGrid.push(row);
            }
        }

        while (newGrid.length < this.height) {
            newGrid.unshift(Array(this.width).fill(0));
        }

        this.grid = newGrid;
        this.totalLinesCleared += linesCleared;

        return linesCleared;
    }

    private addScore(linesCleared: number): void {
        const pointsPerClear = [0, 100, 300, 500, 800];
        const index = Math.min(linesCleared, pointsPerClear.length - 1);
        this.score += pointsPerClear[index];
    }
}
