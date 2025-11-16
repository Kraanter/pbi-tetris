import powerbi from "powerbi-visuals-api";
import { FormattingSettingsService } from "powerbi-visuals-utils-formattingmodel";
import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;
import DataViewCategoricalColumn = powerbi.DataViewCategoricalColumn;
import IVisual = powerbi.extensibility.visual.IVisual;
import VisualHost = powerbi.extensibility.visual.IVisualHost;
import FilterAction = powerbi.FilterAction;

import "./style.css";
import * as models from "powerbi-models";
import { VisualFormattingSettingsModel } from "./settings";
import { PieceType, TetrisGame } from "./tetris";

const pieceColors: Record<PieceType, string> = {
    I: "#22d3ee",
    O: "#facc15",
    T: "#e879f9",
    S: "#4ade80",
    Z: "#f87171",
    J: "#60a5fa",
    L: "#fb923c",
};

const pieceBlocks: Record<PieceType, Array<{ x: number; y: number }>> = {
    I: [
        { x: -1, y: 0 },
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 2, y: 0 },
    ],
    O: [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 0, y: 1 },
        { x: 1, y: 1 },
    ],
    T: [
        { x: -1, y: 0 },
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 0, y: 1 },
    ],
    S: [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: -1, y: 1 },
        { x: 0, y: 1 },
    ],
    Z: [
        { x: -1, y: 0 },
        { x: 0, y: 0 },
        { x: 0, y: 1 },
        { x: 1, y: 1 },
    ],
    J: [
        { x: -1, y: 0 },
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: -1, y: 1 },
    ],
    L: [
        { x: -1, y: 0 },
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 1, y: 1 },
    ],
};

export class Visual implements IVisual {
    private static readonly highScoreStorageKey = "pbi.tetris.highScore";
    private target: HTMLElement;
    private updateCount: number;
    private rowsClearedValue!: HTMLElement;
    private rightScoreText!: HTMLElement;
    private statusText!: HTMLElement;
    private leftPanelText!: HTMLElement;
    private rightMidPanelText!: HTMLElement;
    private rightBottomPanelText!: HTMLElement;
    private formattingSettings: VisualFormattingSettingsModel;
    private formattingSettingsService: FormattingSettingsService;
    private host: VisualHost;
    private dataView: powerbi.DataView;
    private game: TetrisGame;
    private waitForReset: boolean = false;
    private highScore: number = 0;
    private gameLoopTimer: ReturnType<typeof setInterval> | null = null;
    private isStarted: boolean = false;
    private isFocusPaused: boolean = false;
    private canUseLocalStorage: boolean = false;
    private hasResolvedHighScoreLoad: boolean = false;
    private focusOverlay!: HTMLElement;
    private focusOverlayMessage!: HTMLElement;
    private resetButton!: HTMLButtonElement;
    private readonly orderedPieceTypes: PieceType[] = [
        "I",
        "O",
        "T",
        "S",
        "Z",
        "J",
        "L",
    ];

    constructor(options: VisualConstructorOptions) {
        this.host = options.host;
        this.formattingSettingsService = new FormattingSettingsService();
        this.target = options.element;
        this.updateCount = 0;
        this.game = new TetrisGame();
        this.highScore = 0;

        if (document) {
            const root: HTMLElement = document.createElement("div");
            root.className = "tetris-root";

            const statusPanel: HTMLElement = document.createElement("div");
            statusPanel.className = "tetris-panel panel-top-left tetris-block";
            const statusTitle: HTMLElement = document.createElement("div");
            statusTitle.className = "panel-title";
            statusTitle.textContent = "POWER BI\n TETRIS";
            this.statusText = document.createElement("div");
            this.statusText.className = "panel-content centered";
            this.statusText.innerText = "BY Krijn Grimme";
            statusPanel.appendChild(statusTitle);
            statusPanel.appendChild(this.statusText);

            const rowsPanel: HTMLElement = document.createElement("div");
            rowsPanel.className = "tetris-panel panel-top-center";
            this.rowsClearedValue = document.createElement("span");
            this.rowsClearedValue.className = "panel-title";
            this.rowsClearedValue.textContent = "ROWS CLEARED: 0";
            rowsPanel.appendChild(this.rowsClearedValue);

            const rightScorePanel: HTMLElement = document.createElement("div");
            rightScorePanel.className =
                "tetris-panel panel-top-right tetris-block";
            const rightScoreTitle: HTMLElement = document.createElement("div");
            this.rightScoreText = document.createElement("div");
            this.rightScoreText.className = "panel-title";
            rightScorePanel.appendChild(rightScoreTitle);
            rightScorePanel.appendChild(this.rightScoreText);

            const leftPanel: HTMLElement = document.createElement("div");
            leftPanel.className = "tetris-panel panel-left-main tetris-block";
            const leftPanelTitle: HTMLElement = document.createElement("div");
            leftPanelTitle.className = "panel-title";
            leftPanelTitle.textContent = "STATISTICS";
            this.leftPanelText = document.createElement("div");
            this.leftPanelText.className = "panel-content";
            leftPanel.appendChild(leftPanelTitle);
            leftPanel.appendChild(this.leftPanelText);

            const rightMidPanel: HTMLElement = document.createElement("div");
            rightMidPanel.className =
                "tetris-panel panel-right-mid tetris-block";
            const rightMidTitle: HTMLElement = document.createElement("div");
            rightMidTitle.className = "panel-title";
            rightMidTitle.textContent = "STATUS";
            this.rightMidPanelText = document.createElement("div");
            this.rightMidPanelText.className = "panel-content";
            rightMidPanel.appendChild(rightMidTitle);
            rightMidPanel.appendChild(this.rightMidPanelText);

            const rightBottomPanel: HTMLElement = document.createElement("div");
            rightBottomPanel.className =
                "tetris-panel panel-right-bottom tetris-block";
            const rightBottomTitle: HTMLElement = document.createElement("div");
            rightBottomTitle.className = "panel-title";
            rightBottomTitle.textContent = "UPCOMING PIECE";
            this.rightBottomPanelText = document.createElement("div");
            this.rightBottomPanelText.className = "panel-content";
            rightBottomPanel.appendChild(rightBottomTitle);
            rightBottomPanel.appendChild(this.rightBottomPanelText);

            root.appendChild(statusPanel);
            root.appendChild(rowsPanel);
            root.appendChild(rightScorePanel);
            root.appendChild(leftPanel);
            root.appendChild(rightMidPanel);
            root.appendChild(rightBottomPanel);

            this.focusOverlay = document.createElement("div");
            this.focusOverlay.className = "tetris-focus-overlay";
            this.focusOverlayMessage = document.createElement("div");
            this.focusOverlayMessage.textContent = "Click to start playing";
            this.resetButton = document.createElement("button");
            this.resetButton.type = "button";
            this.resetButton.className = "tetris-reset-button";
            this.resetButton.textContent = "Reset game";
            this.resetButton.addEventListener("click", (event) => {
                event.stopPropagation();
                this.resetGame();
            });
            this.focusOverlay.appendChild(this.focusOverlayMessage);
            this.focusOverlay.appendChild(this.resetButton);
            this.focusOverlay.classList.add("visible");
            root.appendChild(this.focusOverlay);

            this.target.appendChild(root);
        }

        // Keyboard input handling
        window.addEventListener("keydown", (e) => {
            switch (e.key) {
                case "r":
                    this.resetGame();
                    break;

                case "h":
                case "a":
                case "ArrowLeft":
                    this.game.moveLeft();
                    break;

                case "l":
                case "d":
                case "ArrowRight":
                    this.game.moveRight();
                    break;

                case "k":
                case "w":
                case "ArrowUp":
                    this.game.rotate();
                    break;

                case "j":
                case "s":
                case "ArrowDown":
                    this.game.softDrop();
                    break;

                case " ":
                    // Space = hard drop
                    e.preventDefault(); // prevents page scroll
                    this.game.hardDrop();
                    break;
            }
        });

        this.target.onclick = () => {
            this.start();
        };

        window.addEventListener("blur", this.handleFocusStateChange);
        window.addEventListener("focus", this.handleFocusStateChange);
        document.addEventListener("visibilitychange", this.handleFocusStateChange);
        this.loadHighScore();
    }

    private readonly handleFocusStateChange = (): void => {
        const shouldPause =
            this.isStarted &&
            !this.waitForReset &&
            (document.hidden || !document.hasFocus());

        if (this.isFocusPaused === shouldPause) {
            return;
        }

        this.isFocusPaused = shouldPause;
        this.focusOverlay.classList.toggle("visible", this.isFocusPaused);
        this.updateStatusText();
    };

    private start() {
        if (this.isStarted) {
            return;
        }

        this.isStarted = true;
        this.handleFocusStateChange();
        this.updateStatusText();
        this.startGameLoop();
    }

    private startGameLoop(): void {
        if (this.gameLoopTimer) {
            clearInterval(this.gameLoopTimer);
        }

        this.gameLoopTimer = setInterval(() => {
            this.gameTick();
        }, 500);
    }

    public update(options: VisualUpdateOptions) {
        this.formattingSettings =
            this.formattingSettingsService.populateFormattingSettingsModel(
                VisualFormattingSettingsModel,
                options.dataViews[0]
            );

        this.dataView = options.dataViews[0];

        if (!this.isStarted) {
            this.updateStatusText();
        }
    }

    public getFormattingModel(): powerbi.visuals.FormattingModel {
        return this.formattingSettingsService.buildFormattingModel(
            this.formattingSettings
        );
    }

    public destroy(): void {
        if (this.gameLoopTimer) {
            clearInterval(this.gameLoopTimer);
            this.gameLoopTimer = null;
        }

        window.removeEventListener("blur", this.handleFocusStateChange);
        window.removeEventListener("focus", this.handleFocusStateChange);
        document.removeEventListener(
            "visibilitychange",
            this.handleFocusStateChange
        );
    }

    private gameTick() {
        if (
            this.waitForReset ||
            this.isFocusPaused ||
            !this.dataView?.categorical?.categories
        ) {
            return;
        }

        this.game.tick();
        this.updateCount += 1;
        const board = this.game.isGameOver()
            ? this.generateGrid(10, 20)
            : this.game.getBoardWithCurrentPiece();

        this.waitForReset = this.game.isGameOver();
        const currentScore = this.game.getScore();
        if (currentScore > this.highScore) {
            this.highScore = currentScore;
            this.saveHighScore(this.highScore);
        }
        this.updateStatusText();

        const newFilter = [this.cordsToFilter(board)];
        this.host.applyJsonFilter(
            newFilter,
            "general",
            "filter",
            FilterAction.merge
        );
    }

    private resetGame(): void {
        this.game.reset();
        this.waitForReset = false;
        this.handleFocusStateChange();
        this.updateStatusText();
    }

    private cordsToFilter(grid: number[][]): models.TupleFilter {
        const values = grid
            .flatMap((col, y) =>
                col.map((cell, x) =>
                    cell > 0 ? this.createCordTuple(x, y, cell) : undefined
                )
            )
            .filter(Boolean);

        return new models.TupleFilter(this.getTupleTargets(), "In", values);
    }

    private createCordTuple(
        x: number,
        y: number,
        color: number
    ): models.TupleValueType {
        return [{ value: x }, { value: y }, { value: (color % 7) + 1 }];
    }

    private generateGrid(width: number, height: number): number[][] {
        return Array.from(new Array(height)).map(() =>
            Array.from(new Array(width)).map(() => 1)
        );
    }

    private getTupleTargets(): models.IFilterColumnTarget[] {
        let xColumn: DataViewCategoricalColumn =
            this.dataView.categorical.categories[0];
        let yColumn: DataViewCategoricalColumn =
            this.dataView.categorical.categories[1];
        let colorColumn: DataViewCategoricalColumn =
            this.dataView.categorical.categories[2];

        let xTarget: models.IFilterColumnTarget = {
            table: xColumn.source.queryName.substring(
                0,
                xColumn.source.queryName.indexOf(".")
            ),
            column: xColumn.source.displayName,
        };

        let yTarget: models.IFilterColumnTarget = {
            table: yColumn.source.queryName.substring(
                0,
                yColumn.source.queryName.indexOf(".")
            ),
            column: yColumn.source.displayName,
        };

        let colorTarget: models.IFilterColumnTarget = {
            table: colorColumn.source.queryName.substring(
                0,
                colorColumn.source.queryName.indexOf(".")
            ),
            column: colorColumn.source.displayName,
        };

        return [xTarget, yTarget, colorTarget];
    }

    private updateStatusText(): void {
        const state = !this.isStarted
            ? "READY"
            : this.waitForReset
              ? "GAME OVER"
              : this.isFocusPaused
                ? "PAUSED"
              : "RUNNING";

        this.rowsClearedValue.textContent = `LINES-${this.game.getTotalLinesCleared().toString().padStart(3, "0")}`;
        this.rightScoreText.textContent =
            `TOP SCORE:\n${this.highScore.toString().padStart(2, "0")}\n` +
            `\nYOUR SCORE:\n${this.game.getScore().toString().padStart(2, "0")}\n`;

        const spawnCounts = this.game.getSpawnCounts();
        this.renderPieceStats(spawnCounts);

        this.rightMidPanelText.textContent = `STATE: ${state}`;
        this.renderUpcomingPiece(this.game.getNextPieceType());

        const showOverlay = !this.isStarted || this.isFocusPaused || this.waitForReset;
        const overlayText = !this.isStarted
            ? "Click to start playing"
            : this.waitForReset
              ? "Game over"
            : "Click the screen to continue playing";
        this.focusOverlayMessage.textContent = overlayText;
        this.resetButton.classList.toggle("visible", this.waitForReset);
        this.focusOverlay.classList.toggle("visible", showOverlay);
    }

    private loadHighScore(): void {
        this.host.storageV2Service
            .status()
            .then((status) => {
                if (status !== powerbi.PrivilegeStatus.Allowed) {
                    return;
                }

                this.canUseLocalStorage = true;
                return this.host.storageV2Service.get(
                    Visual.highScoreStorageKey
                );
            })
            .then((value) => {
                if (typeof value !== "string") {
                    return;
                }

                const parsed = Number(value);
                if (Number.isFinite(parsed) && parsed > this.highScore) {
                    this.highScore = parsed;
                    this.updateStatusText();
                }
            })
            .catch(() => {
                this.canUseLocalStorage = false;
            })
            .finally(() => {
                this.hasResolvedHighScoreLoad = true;
            });

    }

    private saveHighScore(score: number): void {
        if (!this.canUseLocalStorage || !this.hasResolvedHighScoreLoad) {
            return;
        }

        this.host.storageV2Service
            .set(Visual.highScoreStorageKey, String(score))
            .catch(() => {
                // Ignore persistence failures, game can still continue.
            });
    }

    private renderPieceStats(spawnCounts: Record<PieceType, number>): void {
        this.leftPanelText.replaceChildren();

        for (const pieceType of this.orderedPieceTypes) {
            const row = document.createElement("div");
            row.className = "piece-stat-row";

            const shape = this.createPieceShape(
                pieceType,
                16,
                "piece-shape-large"
            );
            row.appendChild(shape);

            const count = document.createElement("span");
            count.className = "piece-stat-count";
            count.textContent = `${spawnCounts[pieceType].toString().padStart(2, "0")}`;
            row.appendChild(count);

            this.leftPanelText.appendChild(row);
        }
    }

    private renderUpcomingPiece(nextPieceType: PieceType | null): void {
        this.rightBottomPanelText.replaceChildren();

        if (!nextPieceType) {
            this.rightBottomPanelText.textContent = "-";
            return;
        }

        const wrapper = document.createElement("div");
        wrapper.className = "upcoming-piece-wrap";

        const shape = this.createPieceShape(
            nextPieceType,
            24,
            "piece-shape-large"
        );
        wrapper.appendChild(shape);

        const label = document.createElement("div");
        label.className = "upcoming-piece-label";
        label.textContent = nextPieceType;

        this.rightBottomPanelText.appendChild(wrapper);
    }

    private createPieceShape(
        pieceType: PieceType,
        cellSize: number,
        className: string
    ): HTMLElement {
        const blocks = pieceBlocks[pieceType];
        let minX = Math.min(...blocks.map((b) => b.x));
        const maxX = Math.max(...blocks.map((b) => b.x));
        const minY = Math.min(...blocks.map((b) => b.y));
        if (maxX - minX === 1) {
            minX -= 1
        }
        const normalized = blocks.map((b) => ({
            x: b.x - minX,
            y: b.y - minY,
        }));

        const activeCells = new Set(normalized.map((b) => `${b.x},${b.y}`));

        const grid = document.createElement("div");
        grid.className = `piece-shape ${className}`;
        grid.style.setProperty("--piece-cell-size", `${cellSize}px`);

        for (let y = 1; y >= 0; y--) {
            for (let x = 0; x < 4; x++) {
                const cell = document.createElement("div");
                if (activeCells.has(`${x},${y}`)) {
                    cell.className = "piece-cell";
                    cell.classList.add("filled");
                    cell.style.setProperty(
                        "--piece-color",
                        pieceColors[pieceType]
                    );
                }
                grid.appendChild(cell);
            }
        }

        return grid;
    }
}
