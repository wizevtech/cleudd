// script.js - versão final (garante execução pós DOM e init idempotente)
// Cole este arquivo como script.js e inclua no HTML:
// <script src="script.js" defer></script>

console.log('script.js carregado');

(function() {
    // estado compartilhado
    if (!window.__SPOTIFY_STATE) window.__SPOTIFY_STATE = {};
    const STATE = window.__SPOTIFY_STATE;

    // inicializa listeners "globais" (hamburger, scroll, modal, form, SPA)
    function setupGlobals() {
        if (STATE.globalsInited) return;
        STATE.globalsInited = true;

        // ===== Hamburger / menu =====
        const hamburger = document.getElementById('hamburger');
        const navMenu = document.getElementById('nav-menu');
        if (hamburger && navMenu) {
            const toggleMenu = () => {
                navMenu.classList.toggle('active');
                hamburger.classList.toggle('active');
            };
            hamburger.addEventListener('click', toggleMenu);
            hamburger.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    toggleMenu();
                }
            });
        }

        // ===== Sticky header & parallax =====
        const header = document.getElementById('site-header');
        const home = document.getElementById('home');
        let ticking = false;

        function onScrollHandler() {
            const scrollY = window.scrollY || window.pageYOffset;
            if (header) {
                if (scrollY > 20) header.classList.add('scrolled');
                else header.classList.remove('scrolled');
            }
            if (home) {
                home.style.backgroundPosition = `center ${Math.round(scrollY * 0.5)}px`;
            }
        }
        window.addEventListener('scroll', () => {
            if (!ticking) {
                window.requestAnimationFrame(() => {
                    onScrollHandler();
                    ticking = false;
                });
                ticking = true;
            }
        }, { passive: true });

        // ===== Modal galeria =====
        const galeriaItems = document.querySelectorAll('.galeria-item');
        const modal = document.getElementById('modal-foto');
        if (modal && galeriaItems && galeriaItems.length) {
            const modalImg = modal.querySelector('img');
            const closeModal = modal.querySelector('.close-modal');
            galeriaItems.forEach(item => {
                item.addEventListener('click', () => {
                    const img = item.querySelector('img');
                    if (!img) return;
                    if (modalImg) modalImg.src = img.src;
                    modal.classList.add('open');
                    modal.setAttribute('aria-hidden', 'false');
                    document.body.style.overflow = 'hidden';
                });
            });
            if (closeModal) {
                closeModal.addEventListener('click', () => {
                    modal.classList.remove('open');
                    modal.setAttribute('aria-hidden', 'true');
                    document.body.style.overflow = '';
                });
            }
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    modal.classList.remove('open');
                    modal.setAttribute('aria-hidden', 'true');
                    document.body.style.overflow = '';
                }
            });
        }

        // ===== Form contato (simulação) =====
        const form = document.getElementById('form-contato');
        if (form) {
            form.addEventListener('submit', (e) => {
                e.preventDefault();
                alert('Mensagem enviada com sucesso! Em breve entraremos em contato.');
                form.reset();
            });
        }

        // ===== SPA navigation (listeners globais) =====
        (function setupSPA() {
            const app = document.getElementById('app');
            if (!app) return;

            function extractMain(htmlText) {
                const parser = new DOMParser();
                const doc = parser.parseFromString(htmlText, 'text/html');
                let node = doc.querySelector('#app');
                if (node) return node.innerHTML;
                node = doc.querySelector('section');
                if (node) {
                    let content = node.outerHTML;
                    if (!node.id || node.id !== 'home') {
                        const footer = doc.querySelector('footer');
                        if (footer) content += footer.outerHTML;
                    }
                    return content;
                }
                return '';
            }

            function updateFooterVisibility(url) {
                const footer = document.querySelector('footer');
                if (!footer) return;
                if (url === '/' || url === '/index.html' || url.endsWith('/index.html')) footer.classList.add('hidden');
                else footer.classList.remove('hidden');
            }

            async function navigateTo(href, push = true) {
                try {
                    const res = await fetch(href, { cache: 'no-cache' });
                    if (!res.ok) throw new Error('fetch-failed');
                    const text = await res.text();
                    const content = extractMain(text);
                    app.innerHTML = content;
                    updateFooterVisibility(href);

                    // executar scripts inline do HTML carregado
                    const parser = new DOMParser();
                    const doc = parser.parseFromString(text, 'text/html');
                    const scripts = Array.from(doc.querySelectorAll('script'));
                    scripts.forEach(s => {
                        const newScript = document.createElement('script');
                        if (s.src) {
                            newScript.src = s.src;
                            newScript.async = false;
                        } else {
                            newScript.textContent = s.textContent;
                        }
                        document.body.appendChild(newScript);
                        setTimeout(() => { try { document.body.removeChild(newScript); } catch (e) {} }, 30000);
                    });
                    if (doc.title) document.title = doc.title;
                    if (push) history.pushState({ url: href }, '', href);
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                } catch (err) {
                    window.location.href = href;
                }
            }

            document.addEventListener('click', (e) => {
                const a = e.target.closest && e.target.closest('a[data-ajax]');
                if (!a) return;
                const href = a.getAttribute('href');
                const target = a.getAttribute('target');
                if (!href || (href.startsWith('http') && new URL(href).origin !== location.origin)) return;
                if (target === '_blank') return;
                e.preventDefault();
                navigateTo(href);
            });

            window.addEventListener('popstate', (ev) => {
                const url = (ev.state && ev.state.url) || location.pathname;
                navigateTo(url, false);
            });
        })();

        console.log('Globals inicializados');
    } // fim setupGlobals

    // ===== Players =====
    // initPlayers será idempotente (cada .spotify-player é inicializado apenas 1 vez)
    function initPlayers() {
        if (!STATE.playerState) STATE.playerState = {};
        // estado global compart.
        const PS = STATE.playerState;
        if (!PS.currentAudio) PS.currentAudio = null;
        if (!PS.currentBtn) PS.currentBtn = null;

        function createAudio(src, player) {
            if (!src) return null;
            const audio = document.createElement('audio');
            audio.src = src;
            audio.preload = 'metadata';
            audio.style.display = 'none';
            player.appendChild(audio);
            return audio;
        }

        function findProgress(player) {
            return player.querySelector('.spotify-progress') ||
                player.querySelector('.progress-bar') ||
                player.querySelector('input[type="range"]') ||
                player.querySelector('.progress');
        }

        function setBtnPlaying(btn, playing) {
            if (!btn) return;
            if (playing) {
                btn.classList.add('playing');
                if (btn.querySelector('i')) btn.innerHTML = '<i class="fas fa-pause"></i>';
                else btn.textContent = '⏸';
            } else {
                btn.classList.remove('playing');
                if (btn.querySelector('i')) btn.innerHTML = '<i class="fas fa-play"></i>';
                else btn.textContent = '▶';
            }
        }

        function setupProgressListener(audio, progress, btn) {
            if (!progress || !audio) return;
            const isInput = progress.tagName && progress.tagName.toLowerCase() === 'input';

            if (isInput) {
                progress.min = progress.min || 0;
                progress.max = progress.max || 100;
                progress.value = progress.value || 0;
                progress.addEventListener('input', () => {
                    if (!audio.duration || isNaN(audio.duration)) return;
                    const p = Number(progress.value) / Number(progress.max || 100);
                    if (typeof audio._startTime === 'number' && typeof audio._endTime === 'number') {
                        const start = audio._startTime,
                            end = audio._endTime;
                        audio.currentTime = start + p * (end - start);
                    } else {
                        audio.currentTime = p * audio.duration;
                    }
                });
            } else {
                progress.addEventListener('click', (ev) => {
                    const rect = progress.getBoundingClientRect();
                    const x = ev.clientX - rect.left;
                    const pct = Math.max(0, Math.min(1, x / rect.width));
                    if (!audio.duration || isNaN(audio.duration)) return;
                    if (typeof audio._startTime === 'number' && typeof audio._endTime === 'number') {
                        const start = audio._startTime,
                            end = audio._endTime;
                        audio.currentTime = start + pct * (end - start);
                    } else {
                        audio.currentTime = pct * audio.duration;
                    }
                });
            }

            audio.addEventListener('timeupdate', () => {
                if (!progress) return;
                const dur = audio.duration || 0;
                const cur = audio.currentTime || 0;
                if (typeof audio._startTime === 'number' && typeof audio._endTime === 'number') {
                    const start = audio._startTime,
                        end = audio._endTime;
                    const length = Math.max(0.0001, end - start);
                    const pct = Math.max(0, Math.min(1, (cur - start) / length)) * 100;
                    if (isInput) progress.value = pct;
                    else progress.style.width = pct + '%';

                    if (cur >= end) {
                        audio.pause();
                        audio.currentTime = start;
                        setBtnPlaying(btn, false);
                        if (isInput) progress.value = 0;
                        else progress.style.width = '0%';
                        if (PS.currentAudio === audio) {
                            PS.currentAudio = null;
                            PS.currentBtn = null;
                        }
                    }
                } else if (dur > 0) {
                    const pct = (cur / dur) * 100;
                    if (isInput) progress.value = pct;
                    else progress.style.width = pct + '%';
                } else {
                    if (isInput) progress.value = 0;
                    else progress.style.width = '0%';
                }
            });
        }

        function setupPlayer(player) {
            if (!player) return;
            // evita inicializar o mesmo player duas vezes
            if (player.dataset.spotifyInit === '1') return;
            player.dataset.spotifyInit = '1';

            const btn = player.querySelector('.play-btn') || player.querySelector('#play-btn') || player.querySelector('button');
            if (!btn) return;

            let audio = player.querySelector('audio');
            if (!audio) {
                const src = player.getAttribute('data-src') || btn.getAttribute('data-src');
                if (src) {
                    audio = createAudio(src, player);
                    console.debug('Audio criado via data-src para player', src);
                }
            }

            if (!audio) {
                btn.disabled = true;
                btn.title = 'Arquivo de áudio não encontrado';
                return;
            }

            const progress = findProgress(player);
            const startAttr = player.getAttribute('data-start') || audio.getAttribute('data-start');
            const endAttr = player.getAttribute('data-end') || audio.getAttribute('data-end');
            const startTime = (startAttr !== null && startAttr !== undefined) ? Math.max(0, Number(startAttr)) : undefined;
            const endTime = (endAttr !== null && endAttr !== undefined) ? Math.max(0, Number(endAttr)) : undefined;

            audio.addEventListener('loadedmetadata', () => {
                audio._startTime = (typeof startTime === 'number' && !isNaN(startTime)) ? startTime : 0;
                audio._endTime = (typeof endTime === 'number' && !isNaN(endTime) && audio.duration && endTime <= audio.duration) ? endTime : undefined;
                if (progress && progress.tagName && progress.tagName.toLowerCase() === 'input') {
                    progress.min = 0;
                    progress.max = 100;
                    progress.value = 0;
                }
                if (audio._seekToStartWhenReady) {
                    if (typeof audio._startTime === 'number' && audio.duration > audio._startTime) audio.currentTime = audio._startTime;
                    audio._seekToStartWhenReady = false;
                }
            });

            audio.addEventListener('ended', () => {
                setBtnPlaying(btn, false);
                if (progress) {
                    if (progress.tagName && progress.tagName.toLowerCase() === 'input') progress.value = 0;
                    else progress.style.width = '0%';
                }
                if (PS.currentAudio === audio) {
                    PS.currentAudio = null;
                    PS.currentBtn = null;
                }
                audio.currentTime = (typeof audio._startTime === 'number') ? audio._startTime : 0;
            });

            btn.addEventListener('click', async(e) => {
                e.preventDefault();
                // pausa outro player se existir
                if (PS.currentAudio && PS.currentAudio !== audio) {
                    try {
                        PS.currentAudio.pause();
                        PS.currentAudio.currentTime = (typeof PS.currentAudio._startTime === 'number') ? PS.currentAudio._startTime : 0;
                    } catch (err) {}
                    if (PS.currentBtn) setBtnPlaying(PS.currentBtn, false);
                    PS.currentAudio = null;
                    PS.currentBtn = null;
                }

                // busca startTime se necessário
                if (audio.paused && typeof startTime === 'number') {
                    if (audio.readyState >= 1 && (!isNaN(audio.duration) && audio.duration > startTime)) {
                        audio.currentTime = startTime;
                    } else {
                        audio._seekToStartWhenReady = true;
                    }
                }

                if (audio.paused) {
                    try {
                        await audio.play();
                        setBtnPlaying(btn, true);
                        PS.currentAudio = audio;
                        PS.currentBtn = btn;
                    } catch (err) {
                        console.warn('Falha ao reproduzir o áudio:', err);
                        setBtnPlaying(btn, false);
                        PS.currentAudio = null;
                        PS.currentBtn = null;
                    }
                } else {
                    audio.pause();
                    setBtnPlaying(btn, false);
                    if (PS.currentAudio === audio) {
                        PS.currentAudio = null;
                        PS.currentBtn = null;
                    }
                }
            });

            setupProgressListener(audio, progress, btn);
        } // fim setupPlayer

        const players = document.querySelectorAll('.spotify-player');
        players.forEach(p => setupPlayer(p));

        console.log('Players inicializados:', document.querySelectorAll('.spotify-player').length);
    } // fim initPlayers

    // Execute: garantir que globals + players rodem após DOM pronto
    function boot() {
        setupGlobals();
        initPlayers();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }

    // expose global initializer for SPA use
    window.initSpotifyPlayers = function() {
        try {
            initPlayers();
        } catch (e) {
            console.warn('initSpotifyPlayers falhou', e);
        }
    };

    document.querySelectorAll('#nav-menu a').forEach(link => {
        link.addEventListener('click', () => {
            const hamburger = document.getElementById('hamburger');
            const navMenu = document.getElementById('nav-menu');
            if (navMenu.classList.contains('active')) {
                navMenu.classList.remove('active');
                hamburger.classList.remove('active');
            }
        });
    });

})(); // fim IIFE

// _______________________________

/* ===== GALERIA: abrir/fechar modal (usa #modal-foto no HTML) ===== */
(function() {
    if (window.__GALLERY_MODAL_INIT_FINAL) return;
    window.__GALLERY_MODAL_INIT_FINAL = true;

    const MODAL_ID = 'modal-foto';
    const GALLERY_SELECTOR = '.galeria-grid';
    const ITEM_SELECTOR = '.galeria-item';
    const IMG_SEL = 'img';

    const modal = document.getElementById(MODAL_ID);
    if (!modal) {
        console.warn('Modal não encontrado:', MODAL_ID);
        return;
    }

    const wrapper = modal.querySelector('.modal-wrapper');
    const modalImg = modal.querySelector('.modal-content');
    const closeBtn = modal.querySelector('.close-modal');
    const captionEl = modal.querySelector('.modal-caption');

    function openModal(src, alt, caption) {
        if (!src) return;
        modalImg.src = src;
        modalImg.alt = alt || 'Foto';
        if (captionEl) captionEl.textContent = caption || (alt || '');
        modal.classList.add('open');
        modal.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';
        // foco no botão fecha para acessibilidade
        if (closeBtn) closeBtn.focus();
    }

    function closeModal() {
        modal.classList.remove('open');
        modal.setAttribute('aria-hidden', 'true');
        document.body.style.overflow = '';
        // limpa src após animação para liberar memória/bandwidth
        setTimeout(() => { try { modalImg.src = ''; if (captionEl) captionEl.textContent = ''; } catch (e) {} }, 220);
    }

    // delegação: clique em item da galeria
    document.addEventListener('click', (e) => {
        const grid = e.target.closest(GALLERY_SELECTOR);
        if (!grid) return;

        const item = e.target.closest(ITEM_SELECTOR);
        if (!item) return;

        const img = item.querySelector(IMG_SEL);
        if (!img) return;

        const full = img.getAttribute('data-full') || img.getAttribute('data-src') || img.src;
        const caption = img.getAttribute('data-caption') || img.alt || '';
        openModal(full, img.alt || '', caption);
    });

    // fechar X
    if (closeBtn) {
        closeBtn.addEventListener('click', (ev) => { ev.preventDefault();
            closeModal(); });
    }

    // fechar ao clicar no overlay (fora do card)
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
    });

    // evitar fechar quando clicar na imagem
    if (modalImg) {
        modalImg.addEventListener('click', (e) => { e.stopPropagation(); });
    }

    // fechar com ESC
    document.addEventListener('keydown', (e) => {
        if ((e.key === 'Escape' || e.key === 'Esc') && modal.classList.contains('open')) {
            closeModal();
        }
    });

})();