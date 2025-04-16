// Отладка
const DEBUG_MODE = false;

// Игровые константы
const GAME_WIDTH = 2280;
const GAME_HEIGHT = 720;
const PLAYER_SPEED = 5;
const JUMP_FORCE = 25;
const GRAVITY = 0.8;
const GROUND_LEVEL = GAME_HEIGHT - 50;
const HP_LOSS_RATE = 1;
const CATERPILLAR_HP_GAIN = 5;
const HYENA_DAMAGE = 30;
const DAMAGE_COOLDOWN = 1000;

const GAME_STATES = {
    MENU: 'menu',
    LOADING: 'loading',
    PLAYING: 'playing',
    PAUSED: 'paused',
    GAME_OVER: 'gameover',
    RESULTS: 'results'
};

// Управление при помощи стрелочек
const keys = {
    ArrowUp: false,
    ArrowLeft: false,
    ArrowRight: false,
};

document.addEventListener('keydown', (e) => {
    if (e.code in keys) {
        keys[e.code] = true;
        e.preventDefault();
    }
});

document.addEventListener('keyup', (e) => {
    if (e.code in keys) {
        keys[e.code] = false;
        e.preventDefault();
    }
});

// Работа спрайтов
class Sprite {
    constructor({
        spriteSheet,
        frameWidth,
        frameHeight,
        animations,
        x = 0,
        y = 0,
        width = frameWidth,
        height = frameHeight,
        flip = false
    }) {
        this.spriteSheet = spriteSheet;
        this.frameWidth = frameWidth;
        this.frameHeight = frameHeight;
        this.animations = animations;
        this.currentAnim = 'idle';
        this.frame = 0;
        this.timer = 0;
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
        this.flip = flip;
        this.loaded = false;

        if (this.spriteSheet.complete) {
            this.loaded = true;
        } else {
            this.spriteSheet.onload = () => {
                this.loaded = true;
            };
            this.spriteSheet.onerror = () => {
                console.error('Failed to load sprite sheet:', this.spriteSheet.src);
            };
        }
    }

    update(deltaTime, state) {
        if (!this.loaded) return;
        
        if (this.currentAnim !== state) {
            this.currentAnim = state;
            this.frame = 0;
            this.timer = 0;
        }

        const anim = this.animations[this.currentAnim];
        if (!anim) return;
        
        this.timer += deltaTime;

        if (this.timer > anim.speed) {
            this.frame = (this.frame + 1) % anim.frames;
            this.timer = 0;
        }
    }

    draw(ctx, cameraX = 0) {
        if (!this.loaded) return;
        
        const anim = this.animations[this.currentAnim];
        if (!anim) return;
        
        const sx = anim.startCol ? anim.startCol * this.frameWidth : this.frame * this.frameWidth;
        const sy = anim.row * this.frameHeight;
        const drawX = this.x - cameraX;
        const drawY = this.y;

        if (this.flip) {
            ctx.save();
            ctx.scale(-1, 1);
            ctx.drawImage(
                this.spriteSheet,
                sx, sy, 
                this.frameWidth, this.frameHeight,
                -drawX - this.width, drawY, 
                this.width, this.height
            );
            ctx.restore();
        } else {
            ctx.drawImage(
                this.spriteSheet,
                sx, sy, 
                this.frameWidth, this.frameHeight,
                drawX, drawY, 
                this.width, this.height
            );
        }
    }
}

// Основной класс с персонажами
class Player {
    constructor(x, y, width, height, character) {
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
        this.character = character;
        this.velocityX = 0;
        this.velocityY = 0;
        this.isJumping = false;
        this.isHidden = false;
        this.hp = 100;
        this.facing = 'right';
        this.state = 'idle';
        
        this.spriteSheet = new Image();
        this.spriteSheet.src = `static/img/Spraits/${character === 'timon' ? 'timon-sprite' : 'PumbaaTLK'}.png`;
        
        this.animations = {
            timon: {
                idle: { frames: 1, row: 1, speed: 0.2, startCol: 0 },
                run: { frames: 5, row: 2, speed: 0.1, startCol: 0 },
                jump: { frames: 3, row: 3, speed: 0.15, startCol: 0 }
            },
            pumbaa: {
                idle: { frames: 1, row: 0, speed: 0.2, startCol: 0 },
                run: { frames: 3, row: 1, speed: 0.1, startCol: 0 },
                jump: { frames: 2, row: 2, speed: 0.15, startCol: 0 }
            }
        };
        
        this.sprite = new Sprite({
            spriteSheet: this.spriteSheet,
            frameWidth: 60,
            frameHeight: 80,
            animations: this.animations[character],
            x: this.x,
            y: this.y,
            width: this.width,
            height: this.height,
            flip: this.facing === 'left'
        });
    }

    update(deltaTime, platforms) {
        if (this.isJumping) {
            this.state = 'jump';
        } else if (Math.abs(this.velocityX) > 0.1) {
            this.state = 'run';
        } else {
            this.state = 'idle';
        }

        // Обновление спрайтов
        this.sprite.x = this.x;
        this.sprite.y = this.y;
        this.sprite.flip = this.facing === 'left';
        this.sprite.update(deltaTime, this.state);

        // Движения
        if (!this.isHidden) {
            if (keys.ArrowLeft) {
                this.velocityX = -PLAYER_SPEED;
                this.facing = 'left';
            } else if (keys.ArrowRight) {
                this.velocityX = PLAYER_SPEED;
                this.facing = 'right';
            } else {
                this.velocityX = 0;
            }

            if (keys.ArrowUp && !this.isJumping) {
                this.velocityY = -JUMP_FORCE;
                this.isJumping = true;
                if (game.jumpSound) {
                    game.jumpSound.currentTime = 0;
                    game.jumpSound.play();
                }
            }
        }

        this.velocityY = Math.min(this.velocityY + GRAVITY, 15);

        this.x += this.velocityX;
        this.y += this.velocityY;

        let onPlatform = false;
        for (const platform of platforms) {
            const isAbovePlatform = this.y + this.height >= platform.y && 
                                  this.y + this.height <= platform.y + platform.height;
            const isHorizontalOverlap = this.x + this.width > platform.x && 
                                      this.x < platform.x + platform.width;
            const isMovingDown = this.velocityY > 0;
            
            if (isAbovePlatform && isHorizontalOverlap && isMovingDown) {
                this.y = platform.y - this.height;
                this.velocityY = 0;
                this.isJumping = false;
                onPlatform = true;
            }
        }

        if (this.y + this.height >= GROUND_LEVEL) {
            this.y = GROUND_LEVEL - this.height;
            this.velocityY = 0;
            this.isJumping = false;
        }
    }

    hide() {
        this.isHidden = true;
        this.velocityX = 0;
        this.velocityY = 0;
    }

    render(ctx, cameraX) {
        if (this.isHidden) return;
        
        if (this.sprite.loaded) {
            this.sprite.draw(ctx, cameraX);
        } else {
            const drawX = this.x - cameraX;
            const drawY = this.y;
            
            ctx.fillStyle = this.character === 'timon' ? '#FFA500' : '#808080';
            ctx.fillRect(drawX, drawY, this.width, this.height);
            
            ctx.fillStyle = 'black';
            ctx.font = '12px Arial';
            ctx.fillText(this.character === 'timon' ? 'Timon' : 'Pumbaa', drawX + 10, drawY + 50);
        }
    }
}

// Класс с персонажем Гиена
class Hyena {
    constructor(x, y, width, height) {
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
        this.velocityX = (Math.random() > 0.5 ? 1 : -1) * 2;
        this.state = 'walk';
        this.startX = x;
        this.directionTimer = 0;
        
        this.spriteSheet = new Image();
        this.spriteSheet.src = 'static/img/Spraits/Hyenas.png';

        this.sprite = new Sprite({
            spriteSheet: this.spriteSheet,
            frameWidth: 80,
            frameHeight: 60,
            animations: {
                walk: { frames: 4, row: 0, speed: 0.15, startCol: 0 },
                run: { frames: 4, row: 1, speed: 0.1, startCol: 0 },
                attack: { frames: 3, row: 2, speed: 0.1, startCol: 0 },
                hurt: { frames: 2, row: 3, speed: 0.2, startCol: 0 }
            },
            x: this.x,
            y: this.y,
            width: this.width,
            height: this.height,
            flip: this.velocityX < 0
        });
    }

    update(deltaTime) {
        this.directionTimer += deltaTime;
        
        if (this.directionTimer > 2 + Math.random() * 3 || 
            Math.abs(this.x - this.startX) > 250 ||
            this.velocityX === 0) {
            
            this.velocityX = (Math.random() > 0.5 ? 1 : -1) * (2 + Math.random() * 2);
            this.directionTimer = 0;
        }
        
        this.x += this.velocityX;
        
        if (Math.abs(this.velocityX) > 3) {
            this.state = 'run';
        } else {
            this.state = 'walk';
        }
        
        this.sprite.x = this.x;
        this.sprite.y = this.y;
        this.sprite.flip = this.velocityX < 0;
        this.sprite.update(deltaTime, this.state);
    }

    render(ctx, cameraX) {
        if (this.sprite.loaded) {
            this.sprite.draw(ctx, cameraX);
        } else {
            const drawX = this.x - cameraX;
            const drawY = this.y;
            
            ctx.fillStyle = '#8B4513';
            ctx.fillRect(drawX, drawY, this.width, this.height);
            
            ctx.fillStyle = 'black';
            ctx.font = '12px Arial';
            ctx.fillText('Hyena', drawX + 10, drawY + 50);
        }
    }
}

// Класс с платформами
class Platform {
    constructor(x, y, width, height, isFinish = false) {
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
        this.isFinish = isFinish;
        this.color = isFinish ? '#FFD700' : '#8B4513';
        this.textureColor = isFinish ? '#FFA500' : '#A0522D';
    }

    render(ctx, cameraX) {
        const drawX = this.x - cameraX;
        const drawY = this.y;


        ctx.fillStyle = this.color;
        ctx.fillRect(drawX, drawY, this.width, this.height);

        ctx.fillStyle = this.textureColor;
        for (let i = 0; i < this.width; i += 20) {
            ctx.fillRect(drawX + i, drawY, 10, this.height);
        }

        if (this.isFinish) {
            ctx.fillStyle = 'black';
            ctx.font = 'bold 16px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('FINISH', drawX + this.width / 2, drawY + this.height / 2 + 5);
            ctx.textAlign = 'left';
        }
    }
}

// Класс Гусеницы - собираемый предмет, восстанавливает здоровье
class Caterpillar {
    constructor(x, y, width, height) {
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
        this.animationTimer = 0;
        this.animationPhase = 0;
        this.collected = false;
        
        this.spriteSheet = new Image();
        this.spriteSheet.src = 'static/img/Caterpillar/caterpillar.png';
        this.loaded = false;
        
        if (this.spriteSheet.complete) {
            this.loaded = true;
        } else {
            this.spriteSheet.onload = () => {
                this.loaded = true;
            };
            this.spriteSheet.onerror = () => {
                console.error('Failed to load caterpillar sprite');
            };
        }
    }

    update(deltaTime) {
        this.animationTimer += deltaTime;
        if (this.animationTimer > 0.5) {
            this.animationPhase = (this.animationPhase + 1) % 2;
            this.animationTimer = 0;
        }
    }

    render(ctx, cameraX) {
        if (this.collected) return;
        
        const drawX = this.x - cameraX;
        const drawY = this.y;

        if (this.loaded) {
            ctx.drawImage(this.spriteSheet, drawX, drawY, this.width, this.height);
        } else {
            ctx.fillStyle = '#32CD32';
            ctx.beginPath();
            ctx.ellipse(
                drawX + this.width / 2, 
                drawY + this.height / 2, 
                this.width / 2, 
                this.height / 2, 
                0, 0, Math.PI * 2
            );
            ctx.fill();

            ctx.fillStyle = 'white';
            ctx.beginPath();
            ctx.arc(drawX + this.width / 3, drawY + this.height / 3, 3, 0, Math.PI * 2);
            ctx.arc(drawX + this.width * 2 / 3, drawY + this.height / 3, 3, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = '#228B22';
            for (let i = 0; i < 3; i++) {
                const offset = this.animationPhase === 0 ? 
                    (i % 2 === 0 ? 2 : -2) : 
                    (i % 2 === 0 ? -2 : 2);
                
                ctx.beginPath();
                ctx.arc(
                    drawX + this.width * (i + 1) / 4, 
                    drawY + this.height + offset, 
                    2, 0, Math.PI * 2
                );
                ctx.fill();
            }
        }
    }
}

// Задний фон
class Background {
    constructor(imagePath, speed, width) {
        this.imagePath = imagePath;
        this.speed = speed;
        this.width = width;
        this.image = new Image();
        this.loaded = false;
        
        this.image.onload = () => {
            this.loaded = true;
            this.scale = GAME_HEIGHT / this.image.height;
            this.scaledWidth = this.image.width * this.scale;
        };
        
        this.image.onerror = () => {
            console.error('Failed to load background:', this.imagePath);
        };
        
        this.image.src = imagePath;
    }
    
    render(ctx, cameraX, canvasWidth, canvasHeight) {
        if (!this.loaded) {
            ctx.fillStyle = this.speed === 0.2 ? '#87CEEB' : 
                          this.speed === 0.5 ? '#32CD32' : '#8B4513';
            ctx.fillRect(0, 0, canvasWidth, canvasHeight);
            return;
        }
        
        const offset = (cameraX * this.speed) % this.scaledWidth;
        
        ctx.drawImage(
            this.image, 
            -offset, 0, 
            this.scaledWidth, canvasHeight
        );
        
        ctx.drawImage(
            this.image, 
            this.scaledWidth - offset, 0, 
            this.scaledWidth, canvasHeight
        );
    }
}

// Основной класс с логикой
class Game {
    constructor() {
        this.state = GAME_STATES.MENU;
        this.canvas = document.getElementById('game-canvas');
        this.ctx = this.canvas.getContext('2d');
        this.player = null;
        this.platforms = [];
        this.enemies = [];
        this.items = [];
        this.backgrounds = [];
        this.cameraX = 0;
        this.timer = 0;
        this.score = 0;
        this.playerName = '';
        this.selectedCharacter = 'timon';
        this.lastFrameTime = 0;
        this.deltaTime = 0;
        this.gameTime = 0;
        this.hpLossAccumulator = 0;
        this.lastDamageTime = 0;
        this.leaderboard = [];
        this.assets = {};
        
        // Музыка
        this.bgMusic = new Audio();
        this.jumpSound = new Audio();
        this.eatSound = new Audio();
        this.hurtSound = new Audio();
        
        this.initCanvas();
        this.setupEventListeners();
    }
    
    initCanvas() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        
        window.addEventListener('resize', () => {
            this.canvas.width = window.innerWidth;
            this.canvas.height = window.innerHeight;
            if (this.state === GAME_STATES.PLAYING) {
                this.render();
            }
        });
    }
    
    setupEventListeners() {
        const playerNameInput = document.getElementById('player-name');
        const startBtn = document.getElementById('start-btn');
        
        if (playerNameInput && startBtn) {
            playerNameInput.addEventListener('input', (e) => {
                startBtn.disabled = e.target.value.trim() === '';
            });
            
            startBtn.addEventListener('click', () => {
                this.playerName = playerNameInput.value.trim();
                this.startLoading();
            });
        }
        
        const characterOptions = document.querySelectorAll('.character-option');
        if (characterOptions) {
            characterOptions.forEach(option => {
                option.addEventListener('click', () => {
                    document.querySelectorAll('.character-option').forEach(opt => {
                        opt.classList.remove('selected');
                    });
                    option.classList.add('selected');
                    this.selectedCharacter = option.dataset.char;
                });
            });
        }
        
        document.addEventListener('keydown', (e) => {
            if (e.code === 'Escape') {
                if (this.state === GAME_STATES.PLAYING) {
                    this.pauseGame();
                } else if (this.state === GAME_STATES.PAUSED) {
                    this.resumeGame();
                }
            }
        });
        
        const restartBtn = document.getElementById('restart-btn');
        if (restartBtn) {
            restartBtn.addEventListener('click', () => {
                this.restartGame();
            });
        }
    }
    
    startLoading() {
        this.state = GAME_STATES.LOADING;
        document.getElementById('start-screen').classList.add('hidden');
        document.getElementById('loading-screen').classList.remove('hidden');
        
        const progressBar = document.querySelector('.progress');
        let loadedCount = 0;
        const totalResources = 11;
        
        const updateProgress = () => {
            loadedCount++;
            const progress = Math.floor((loadedCount / totalResources) * 100);
            progressBar.style.width = `${progress}%`;
            
            if (loadedCount >= totalResources) {
                setTimeout(() => this.startGame(), 500);
            }
        };
        
        const resources = [
            { type: 'image', path: 'static/img/Spraits/timon-sprite.png', id: 'timon' },
            { type: 'image', path: 'static/img/Spraits/PumbaaTLK.png', id: 'pumbaa' },
            { type: 'image', path: 'static/img/Spraits/Hyenas.png', id: 'hyena' },
            { type: 'image', path: 'static/img/Caterpillar/caterpillar.png', id: 'caterpillar' },
            { type: 'image', path: 'static/img/Back/25446463.png', id: 'bg1' },
            { type: 'image', path: 'static/img/Back/e026ddbb04ba09aef7be20ccf076a187.png', id: 'bg2' },
            { type: 'image', path: 'static/img/Back/pzapwisrt5dy.png', id: 'bg3' },
            { type: 'audio', element: this.bgMusic, src: 'assets/music.mp3', id: 'music' },
            { type: 'audio', element: this.jumpSound, src: 'assets/jump.wav', id: 'jump' },
            { type: 'audio', element: this.eatSound, src: 'assets/eat.wav', id: 'eat' },
            { type: 'audio', element: this.hurtSound, src: 'assets/hurt.wav', id: 'hurt' }
        ];
        
        resources.forEach(res => {
            if (res.type === 'image') {
                const img = new Image();
                img.onload = updateProgress;
                img.onerror = () => {
                    console.error('Failed to load image:', res.path);
                    updateProgress();
                };
                img.src = res.path;
                this.assets[res.id] = img;
            } else if (res.type === 'audio') {
                res.element.src = res.src;
                res.element.oncanplaythrough = updateProgress;
                res.element.onerror = () => {
                    console.error('Failed to load audio:', res.src);
                    updateProgress();
                };
                res.element.preload = 'auto';
                res.element.load();
                this.assets[res.id] = res.element;
            }
        });
    }
    
    startGame() {
        this.state = GAME_STATES.PLAYING;
        document.getElementById('loading-screen').classList.add('hidden');
        document.getElementById('game-screen').classList.remove('hidden');
        
        this.initGameObjects();
        
        document.getElementById('hud-player-name').textContent = this.playerName;
        this.updateHealthBar();
        document.getElementById('caterpillar-count').textContent = '0';
        document.getElementById('game-timer').textContent = '00:00';

        this.bgMusic.volume = 0.3;
        this.bgMusic.loop = true;
        this.bgMusic.play().catch(e => console.error('Audio play failed:', e));

        this.lastFrameTime = performance.now();
        requestAnimationFrame(this.gameLoop.bind(this));
    }
    
    initGameObjects() {
        this.timer = 0;
        this.score = 0;
        this.gameTime = 0;
        this.hpLossAccumulator = 0;
        this.lastDamageTime = 0;
        this.cameraX = 0;
        this.platforms = [];
        this.enemies = [];
        this.items = [];

        this.player = new Player(
            100,
            GROUND_LEVEL - 100,
            60,
            80,
            this.selectedCharacter
        );

        this.createPlatforms();

        this.spawnCaterpillar();
        this.spawnCaterpillar();

        this.backgrounds = [
            new Background('static/img/Back/25446463.png', 0.2, GAME_WIDTH * 3),
            new Background('static/img/Back/e026ddbb04ba09aef7be20ccf076a187.png', 0.5, GAME_WIDTH * 3),
            new Background('static/img/Back/pzapwisrt5dy.png', 0.7, GAME_WIDTH * 3),
        ];
    }
    
    createPlatforms() {
        const platformCount = 15;
        const minWidth = 100;
        const maxWidth = 250;
        const minHeight = 20;
        const maxHeight = 40;
        const minGap = 200;
        const maxGap = 400;
        
        let x = 300;
        
        for (let i = 0; i < platformCount; i++) {
            const width = minWidth + Math.random() * (maxWidth - minWidth);
            const height = minHeight + Math.random() * (maxHeight - minHeight);
            const y = GROUND_LEVEL - 150 - Math.random() * 200;
            
            this.platforms.push(new Platform(x, y, width, height));
            
            x += width + (minGap + Math.random() * (maxGap - minGap));
        }

        this.platforms.push(new Platform(x, GROUND_LEVEL - 100, 100, 50, true));
    }
    
    spawnCaterpillar() {
        if (this.items.length >= 2) return;
        
        const platform = this.platforms[Math.floor(Math.random() * (this.platforms.length - 1))];
        const x = platform.x + Math.random() * (platform.width - 30);
        const y = platform.y - 30;
        
        this.items.push(new Caterpillar(x, y, 30, 20));
    }
    
    spawnHyena() {
        if (Math.random() > 0.02 || this.enemies.length >= 3) return;
        
        const x = this.cameraX + this.canvas.width + 100 + Math.random() * 300;
        const y = GROUND_LEVEL - 80;
        
        this.enemies.push(new Hyena(x, y, 80, 60));
    }
    
    gameLoop(currentTime) {
        if (this.state !== GAME_STATES.PLAYING) return;
        
        if (DEBUG_MODE) {
            console.log(`Player: X=${this.player.x.toFixed(1)}, Y=${this.player.y.toFixed(1)}`);
            console.log(`Camera: X=${this.cameraX.toFixed(1)}`);
            console.log(`Enemies: ${this.enemies.length}, Items: ${this.items.length}`);
        }
        
        this.deltaTime = (currentTime - this.lastFrameTime) / 1000;
        this.lastFrameTime = currentTime;
        
        this.update();
        this.render();
        
        requestAnimationFrame(this.gameLoop.bind(this));
    }
    
    update() {
        this.gameTime += this.deltaTime;
        this.timer = Math.floor(this.gameTime);
        this.updateTimerDisplay();

        this.hpLossAccumulator += this.deltaTime;
        if (this.hpLossAccumulator >= 1) {
            this.player.hp -= HP_LOSS_RATE;
            this.hpLossAccumulator -= 1;
            this.updateHealthBar();
            
            if (this.player.hp <= 0) {
                this.gameOver(false);
                return;
            }
        }

        this.player.update(this.deltaTime, this.platforms);

        this.updateCamera();

        this.enemies.forEach(enemy => {
            enemy.update(this.deltaTime);
            
            if (enemy.x + enemy.width < this.cameraX - 100) {
                this.enemies = this.enemies.filter(e => e !== enemy);
            }
        });

        this.items.forEach(item => {
            if (item instanceof Caterpillar) {
                item.update(this.deltaTime);
            }
            
            if (this.checkCollision(this.player, item)) {
                if (item instanceof Caterpillar) {
                    this.player.hp = Math.min(100, this.player.hp + CATERPILLAR_HP_GAIN);
                    this.score++;
                    document.getElementById('caterpillar-count').textContent = this.score;
                    this.updateHealthBar();
                    if (this.eatSound) {
                        this.eatSound.currentTime = 0;
                        this.eatSound.play().catch(e => console.error('Eat sound error:', e));
                    }
                    this.items = this.items.filter(i => i !== item);
                    this.spawnCaterpillar();
                }
            }
        });

        this.enemies.forEach(enemy => {
            if (this.checkCollision(this.player, enemy)) {
                const now = Date.now();
                if (now - this.lastDamageTime >= DAMAGE_COOLDOWN) {
                    this.player.hp -= HYENA_DAMAGE;
                    this.lastDamageTime = now;
                    this.updateHealthBar();
                    if (this.hurtSound) {
                        this.hurtSound.currentTime = 0;
                        this.hurtSound.play().catch(e => console.error('Hurt sound error:', e));
                    }
                    
                    if (this.player.hp <= 0) {
                        this.gameOver(false);
                        return;
                    }
                }
            }
        });

        this.spawnHyena();

        const lastPlatform = this.platforms[this.platforms.length - 1];
        if (this.player.x > lastPlatform.x + lastPlatform.width / 2) {
            this.gameOver(true);
        }
    }
    
    updateCamera() {
        const centerX = this.canvas.width / 3;
        const targetX = this.player.x - centerX;

        this.cameraX += (targetX - this.cameraX) * 0.1;

        this.cameraX = Math.max(0, Math.min(
            this.cameraX,
            this.platforms[this.platforms.length - 1].x + 200 - this.canvas.width
        ));

        if (this.player.x < 50) {
            this.player.x = 50;
        }
    }
    
    checkCollision(obj1, obj2) {
        return obj1.x < obj2.x + obj2.width &&
               obj1.x + obj1.width > obj2.x &&
               obj1.y < obj2.y + obj2.height &&
               obj1.y + obj1.height > obj2.y;
    }
    
    updateTimerDisplay() {
        const minutes = Math.floor(this.timer / 60);
        const seconds = this.timer % 60;
        document.getElementById('game-timer').textContent = 
            `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
    
    updateHealthBar() {
        const healthBar = document.getElementById('health-bar-fill');
        healthBar.style.width = `${this.player.hp}%`;
        document.getElementById('health-value').textContent = Math.max(0, Math.floor(this.player.hp));
        
        if (this.player.hp < 30) {
            healthBar.style.backgroundColor = '#ff5555';
            healthBar.classList.add('pulse');
        } else if (this.player.hp < 60) {
            healthBar.style.backgroundColor = '#ffaa00';
            healthBar.classList.remove('pulse');
        } else {
            healthBar.style.backgroundColor = '#4CAF50';
            healthBar.classList.remove('pulse');
        }
    }
    
    render() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        const visibleLeft = this.cameraX;
        const visibleRight = this.cameraX + this.canvas.width;

        this.backgrounds.forEach(bg => {
            bg.render(this.ctx, this.cameraX, this.canvas.width, this.canvas.height);
        });

        this.ctx.fillStyle = '#8B4513';
        this.ctx.fillRect(
            0 - this.cameraX, 
            GROUND_LEVEL, 
            this.platforms[this.platforms.length - 1].x + 300, 
            this.canvas.height - GROUND_LEVEL
        );

        this.platforms.forEach(platform => {
            if (platform.x + platform.width > visibleLeft && platform.x < visibleRight) {
                platform.render(this.ctx, this.cameraX);
            }
        });

        this.items.forEach(item => {
            if (item.x + item.width > visibleLeft && item.x < visibleRight) {
                item.render(this.ctx, this.cameraX);
            }
        });

        this.enemies.forEach(enemy => {
            if (enemy.x + enemy.width > visibleLeft && enemy.x < visibleRight) {
                enemy.render(this.ctx, this.cameraX);
            }
        });

        this.player.render(this.ctx, this.cameraX);
    }
    
    pauseGame() {
        this.state = GAME_STATES.PAUSED;
        document.getElementById('pause-screen').classList.remove('hidden');
        this.bgMusic.pause();
    }
    
    resumeGame() {
        this.state = GAME_STATES.PLAYING;
        document.getElementById('pause-screen').classList.add('hidden');
        this.bgMusic.play().catch(e => console.error('Resume music error:', e));
        this.lastFrameTime = performance.now();
        requestAnimationFrame(this.gameLoop.bind(this));
    }
    
    gameOver(isWin) {
        this.state = GAME_STATES.GAME_OVER;
        this.bgMusic.pause();
        
        const finalScore = 1000 - this.timer + this.score * 10;
        
        document.getElementById('final-time').textContent = 
            `${Math.floor(this.timer / 60)} мин ${this.timer % 60} сек`;
        document.getElementById('final-caterpillars').textContent = this.score;
        document.getElementById('final-score').textContent = finalScore;
        
        this.saveResult(finalScore);
        
        setTimeout(() => {
            this.state = GAME_STATES.RESULTS;
            document.getElementById('game-screen').classList.add('hidden');
            document.getElementById('result-screen').classList.remove('hidden');
        }, 1500);
    }
    
    saveResult(score) {
        const result = {
            name: this.playerName,
            score: score,
            time: this.timer,
            date: new Date().toISOString()
        };
        
        let leaderboard = JSON.parse(localStorage.getItem('timon-pumbaa-leaderboard') || '[]');
        leaderboard.push(result);
        leaderboard.sort((a, b) => b.score - a.score);
        
        if (leaderboard.length > 10) {
            leaderboard = leaderboard.slice(0, 10);
        }
        
        localStorage.setItem('timon-pumbaa-leaderboard', JSON.stringify(leaderboard));
        this.leaderboard = leaderboard;
        this.displayLeaderboard(result);
    }
    
    displayLeaderboard(currentResult) {
        const leaderboardBody = document.getElementById('leaderboard-body');
        if (!leaderboardBody) return;
        
        leaderboardBody.innerHTML = '';
        
        let currentInTop10 = false;
        
        this.leaderboard.forEach((entry, index) => {
            const row = document.createElement('tr');
            
            if (entry.name === currentResult.name && entry.score === currentResult.score) {
                row.classList.add('highlight');
                currentInTop10 = true;
            }
            
            row.innerHTML = `
                <td>${index + 1}</td>
                <td>${entry.name}</td>
                <td>${entry.score}</td>
                <td>${Math.floor(entry.time / 60)}:${(entry.time % 60).toString().padStart(2, '0')}</td>
            `;
            
            leaderboardBody.appendChild(row);
        });
        
        if (!currentInTop10) {
            const allResults = JSON.parse(localStorage.getItem('timon-pumbaa-leaderboard') || []);
            allResults.push(currentResult);
            allResults.sort((a, b) => b.score - a.score);
            const position = allResults.findIndex(r => 
                r.name === currentResult.name && r.score === currentResult.score) + 1;
            
            const row = document.createElement('tr');
            row.classList.add('highlight');
            row.innerHTML = `
                <td>${position}</td>
                <td>${currentResult.name}</td>
                <td>${currentResult.score}</td>
                <td>${Math.floor(currentResult.time / 60)}:${(currentResult.time % 60).toString().padStart(2, '0')}</td>
            `;
            
            leaderboardBody.appendChild(row);
        }
    }
    
    restartGame() {
        document.getElementById('result-screen').classList.add('hidden');
        this.startGame();
    }
}

window.addEventListener('load', () => {
    const game = new Game();
    window.game = game;
});