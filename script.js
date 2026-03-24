document.addEventListener("DOMContentLoaded", () => {
    const game = new Chess();
    const $status = $('#status');
    const $aiThinking = $('#aiThinking');
    const $promotionModal = $('#promotionModal');
    const $toast = $('#toast');
    const $difficultySelect = $('#difficulty');
    let board = null;
    let engine = null;
    let pendingMove = null;

    // --- Localization ---
    const translations = {
        ar: {
            title: "شطرنج سريع", diffBeginner: "مبتدئ", diffIntermediate: "متوسط", diffAdvanced: "صعب", diffExpert: "خبير",
            newGame: "لعبة جديدة", aiThinking: "الذكاء الاصطناعي يفكر...", statusWhite: "دور الأبيض للتحرك", statusBlack: "دور الأسود للتحرك",
            checkmateWhite: "كش مات! فاز الأبيض", checkmateBlack: "كش مات! فاز الأسود", draw: "تعادل!", check: " - كش ملك!",
            footerText: 'تطوير بواسطة <a href="https://www.linkedin.com/in/mahmoud-ghosheh/" target="_blank" rel="noopener noreferrer">Mahmoud Ghosheh</a>',
            promoTitle: "اختر الترقية",
            levelChangeText: "تم تغيير المستوى إلى: "
        },
        en: {
            title: "Fast Chess", diffBeginner: "Beginner", diffIntermediate: "Intermediate", diffAdvanced: "Advanced", diffExpert: "Expert",
            newGame: "New Game", aiThinking: "AI is thinking...", statusWhite: "White to move", statusBlack: "Black to move",
            checkmateWhite: "Checkmate! White wins", checkmateBlack: "Checkmate! Black wins", draw: "Draw!", check: " - Check!",
            footerText: 'Developed by <a href="https://www.linkedin.com/in/mahmoud-ghosheh/" target="_blank" rel="noopener noreferrer">Mahmoud Ghosheh</a>',
            promoTitle: "Choose Promotion",
            levelChangeText: "Level changed to: "
        }
    };

    let currentLang = localStorage.getItem('lang') || 'ar';
    const langToggle = document.getElementById('langToggle');

    function applyLanguage(lang) {
        currentLang = lang;
        document.documentElement.setAttribute('lang', lang);
        document.documentElement.setAttribute('dir', lang === 'ar' ? 'rtl' : 'ltr');
        langToggle.textContent = lang === 'ar' ? 'EN' : 'AR';
        localStorage.setItem('lang', lang);

        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            if (translations[lang][key] && el.id !== 'status') {
                el.innerHTML = translations[lang][key]; 
            }
        });
        updateStatus(); 
    }

    langToggle.addEventListener('click', () => applyLanguage(currentLang === 'ar' ? 'en' : 'ar'));

    // --- Theme Management ---
    const themeToggle = document.getElementById('themeToggle');
    const currentTheme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', currentTheme);
    themeToggle.textContent = currentTheme === 'dark' ? '☀️' : '🌙';

    themeToggle.addEventListener('click', () => {
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        const newTheme = isDark ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
        themeToggle.textContent = isDark ? '🌙' : '☀️';
    });

    // --- Toast Notification ---
    function showToast(message) {
        $toast.text(message).addClass('show');
        setTimeout(() => { $toast.removeClass('show'); }, 3000);
    }

    $difficultySelect.on('change', function() {
        const selectedText = $(this).find('option:selected').text();
        const prefix = translations[currentLang].levelChangeText;
        showToast(prefix + selectedText);
    });

    // --- Highlights & Visuals ---
    function removeHighlights() {
        $('#board .square-55d63').removeClass('highlight-square in-check');
    }

    function highlightMove(source, target) {
        $('#board .square-' + source).addClass('highlight-square');
        $('#board .square-' + target).addClass('highlight-square');
    }

    function findKingSquare(color) {
        const squares = ['a8', 'b8', 'c8', 'd8', 'e8', 'f8', 'g8', 'h8',
                         'a7', 'b7', 'c7', 'd7', 'e7', 'f7', 'g7', 'h7',
                         'a6', 'b6', 'c6', 'd6', 'e6', 'f6', 'g6', 'h6',
                         'a5', 'b5', 'c5', 'd5', 'e5', 'f5', 'g5', 'h5',
                         'a4', 'b4', 'c4', 'd4', 'e4', 'f4', 'g4', 'h4',
                         'a3', 'b3', 'c3', 'd3', 'e3', 'f3', 'g3', 'h3',
                         'a2', 'b2', 'c2', 'd2', 'e2', 'f2', 'g2', 'h2',
                         'a1', 'b1', 'c1', 'd1', 'e1', 'f1', 'g1', 'h1'];
        for (let i = 0; i < squares.length; i++) {
            const piece = game.get(squares[i]);
            if (piece && piece.type === 'k' && piece.color === color) {
                return squares[i];
            }
        }
        return null;
    }

    // --- Web Worker Engine ---
    const workerCode = `importScripts("https://cdnjs.cloudflare.com/ajax/libs/stockfish.js/10.0.2/stockfish.js");`;
    const blob = new Blob([workerCode], {type: 'application/javascript'});
    engine = new Worker(URL.createObjectURL(blob));

    engine.onmessage = function(event) {
        const line = event.data;
        if (line && line.indexOf('bestmove') > -1) {
            const match = line.match(/^bestmove ([a-h][1-8])([a-h][1-8])([qrbn])?/);
            if (match) {
                game.move({ from: match[1], to: match[2], promotion: match[3] || 'q' });
                board.position(game.fen());
                removeHighlights();
                highlightMove(match[1], match[2]); 
                $aiThinking.removeClass('active');
                updateStatus();
            }
        }
    };
    engine.postMessage('uci');
    engine.postMessage('isready');

    // --- Game Logic ---
    function updateStatus() {
        let statusText = '';
        const t = translations[currentLang];
        
        $('#board .square-55d63').removeClass('in-check');

        if (game.in_checkmate()) {
            if (game.turn() === 'b') {
                statusText = t.checkmateWhite;
                confetti({ particleCount: 150, spread: 80, origin: { y: 0.6 }, zIndex: 3000 });
            } else {
                statusText = t.checkmateBlack;
            }
            
            const kingSq = findKingSquare(game.turn());
            if (kingSq) $('#board .square-' + kingSq).addClass('in-check');

        } else if (game.in_draw() || game.in_stalemate() || game.in_threefold_repetition()) {
            statusText = t.draw;
        } else {
            statusText = game.turn() === 'b' ? t.statusBlack : t.statusWhite;
            
            if (game.in_check()) {
                statusText += t.check;
                const kingSq = findKingSquare(game.turn());
                if (kingSq) $('#board .square-' + kingSq).addClass('in-check');
            }
        }
        $status.text(statusText);
    }

    function askEngine() {
        if (game.game_over()) return;
        $aiThinking.addClass('active');
        
        const skillLevel = parseInt($difficultySelect.val(), 10);
        
        if (skillLevel === 0 && Math.random() < 0.40) {
            const possibleMoves = game.moves({ verbose: true });
            const randomMove = possibleMoves[Math.floor(Math.random() * possibleMoves.length)];
            
            setTimeout(() => {
                game.move({ from: randomMove.from, to: randomMove.to, promotion: 'q' });
                board.position(game.fen());
                removeHighlights();
                highlightMove(randomMove.from, randomMove.to);
                $aiThinking.removeClass('active');
                updateStatus();
            }, 500);
            return; 
        }

        let depth = 1;
        if (skillLevel === 5) depth = 3;
        if (skillLevel === 15) depth = 10;
        if (skillLevel === 20) depth = 15;

        engine.postMessage('setoption name Skill Level value ' + skillLevel);
        engine.postMessage('position fen ' + game.fen());
        engine.postMessage('go depth ' + depth);
    }

    function isPromotion(source, target) {
        const piece = game.get(source);
        if (piece && piece.type === 'p') {
            if ((piece.color === 'w' && target.charAt(1) === '8') || 
                (piece.color === 'b' && target.charAt(1) === '1')) {
                const moves = game.moves({ verbose: true });
                return moves.some(m => m.from === source && m.to === target && m.flags.includes('p'));
            }
        }
        return false;
    }

    function onDrop(source, target) {
        if (isPromotion(source, target)) {
            pendingMove = { from: source, to: target };
            $promotionModal.css('display', 'flex'); 
            return 'snapback'; 
        }

        const move = game.move({ from: source, to: target });
        if (move === null) return 'snapback';
        
        $difficultySelect.prop('disabled', true);
        
        removeHighlights();
        highlightMove(source, target); 
        updateStatus();
        window.setTimeout(askEngine, 250);
    }

    $('.promo-btn').on('click', function() {
        const chosenPiece = $(this).data('piece');
        $promotionModal.hide(); 
        
        if (pendingMove) {
            game.move({ from: pendingMove.from, to: pendingMove.to, promotion: chosenPiece });
            board.position(game.fen());
            
            $difficultySelect.prop('disabled', true); 
            
            removeHighlights();
            highlightMove(pendingMove.from, pendingMove.to); 
            pendingMove = null;
            updateStatus();
            window.setTimeout(askEngine, 250); 
        }
    });

    function onDragStart(source, piece) {
        if (game.game_over() || piece.search(/^b/) !== -1) return false;
    }

    const config = {
        draggable: true,
        position: 'start',
        onDragStart: onDragStart,
        onDrop: onDrop,
        pieceTheme: 'https://chessboardjs.com/img/chesspieces/wikipedia/{piece}.png'
    };

    board = Chessboard('board', config);
    applyLanguage(currentLang); 
    updateStatus();

    $(window).resize(() => board.resize());

    $('#resetBtn').on('click', () => {
        game.reset();
        board.start();
        removeHighlights(); 
        $aiThinking.removeClass('active');
        $promotionModal.hide(); 
        $difficultySelect.prop('disabled', false); 
        pendingMove = null;
        updateStatus();
    });
});