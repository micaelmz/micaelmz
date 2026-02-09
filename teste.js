(async function () {
    'use strict';

    // ============================================================================
    // CONFIGURAÇÃO E INICIALIZAÇÃO
    // ============================================================================

    let STORE_ID = null;
    let PLATFORM = null;

    // NuvemShop detection (LS.store.id)
    if (window.LS && window.LS.store && window.LS.store.id) {
        STORE_ID = String(window.LS.store.id);
        PLATFORM = 'nuvemshop';
    }
    // Shopify fallback
    else if (window.Shopify && window.Shopify.shop) {
        STORE_ID = window.Shopify.shop.split('.')[0];
        PLATFORM = 'shopify';
    }

    if (!STORE_ID) {
        console.warn('[Praqt Popup] Store not identified');
        return;
    }

    console.log('[Praqt Popup] Store ID:', STORE_ID, '| Platform:', PLATFORM);

    //const API_BASE = 'https://2fgvxez7z8.execute-api.sa-east-1.amazonaws.com/production';
    const API_BASE = ' https://a5dd-138-186-27-20.ngrok-free.app/local';

    let activePopups;
    try {
        const res = await fetch(`${API_BASE}/popups?storeId=${STORE_ID}`, {
            method: 'GET',
            headers: { 'ngrok-skip-browser-warning': '69420', 'Content-Type': 'application/json', 'Accept': 'application/json' }
        });
        if (!res.ok) throw new Error('Erro ao buscar configuração');
        const payload = await res.json();

        activePopups = (payload.popups || []).filter(p => p.is_active);
        if (activePopups.length === 0) {
            console.log('[Praqt Popup] Nenhum popup ativo encontrado');
            return;
        }
    } catch (e) {
        console.error('[Praqt Popup] Erro ao carregar popups:', e);
        return;
    }

    // ============================================================================
    // UTILITÁRIOS
    // ============================================================================

    const Utils = {
        storage: {
            getJSON(key) {
                try { return JSON.parse(localStorage.getItem(key) || 'null'); }
                catch (_) { return null; }
            },
            setJSON(key, val) {
                try { localStorage.setItem(key, JSON.stringify(val)); }
                catch (_) {}
            }
        },

        masks: {
            cpf(v) {
                v = v.replace(/\D/g, '').slice(0, 11);
                if (v.length <= 3) return v;
                if (v.length <= 6) return v.replace(/(\d{3})(\d+)/, '$1.$2');
                if (v.length <= 9) return v.replace(/(\d{3})(\d{3})(\d+)/, '$1.$2.$3');
                return v.replace(/(\d{3})(\d{3})(\d{3})(\d+)/, '$1.$2.$3-$4');
            },
            phone(v) {
                v = v.replace(/\D/g, '').slice(0, 11);
                if (v.length <= 2) return v;
                if (v.length <= 6) return v.replace(/(\d{2})(\d{1,4})/, '($1) $2');
                if (v.length <= 10) return v.replace(/(\d{2})(\d{4})(\d{1,4})/, '($1) $2-$3');
                return v.replace(/(\d{2})(\d{5})(\d{1,4})/, '($1) $2-$3');
            }
        },

        validators: {
            email(v) {
                return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
            },
            whatsapp(v) {
                const digits = v.replace(/\D/g, '');
                return digits.length === 11 && digits[2] === '9';
            },
            cpf(cpf) {
                cpf = cpf.replace(/\D/g, '');
                if (cpf.length !== 11 || /^(\d)\1+$/.test(cpf)) return false;
                let sum = 0;
                for (let i = 0; i < 9; i++) sum += parseInt(cpf.charAt(i), 10) * (10 - i);
                let rev = 11 - (sum % 11);
                if (rev >= 10) rev = 0;
                if (rev !== parseInt(cpf.charAt(9), 10)) return false;
                sum = 0;
                for (let i = 0; i < 10; i++) sum += parseInt(cpf.charAt(i), 10) * (11 - i);
                rev = 11 - (sum % 11);
                if (rev >= 10) rev = 0;
                return rev === parseInt(cpf.charAt(10), 10);
            }
        },

        showErrorModal(msg) {
            document.querySelectorAll('[id$="-error-modal"]').forEach(el => el.remove());
            const m = document.createElement('div');
            m.id = 'popup-error-modal';
            m.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.6);z-index:10002;';
            m.innerHTML = `
                <div style="background:#fff;padding:20px;border-radius:8px;max-width:300px;text-align:center;font-family:system-ui,sans-serif;">
                    <h2 style="margin-bottom:12px;">🚫 Ops!</h2>
                    <p style="margin-bottom:20px;">${msg}</p>
                    <button id="close-error" style="padding:8px 16px;border:none;background:#ff6b6b;color:#fff;border-radius:4px;cursor:pointer;">Fechar</button>
                </div>
            `;
            document.body.appendChild(m);
            m.querySelector('#close-error').onclick = () => m.remove();
        },

        showToast(msg, type = 'success') {
            const toast = document.createElement('div');
            toast.style.cssText = `position:fixed;bottom:20px;left:50%;transform:translateX(-50%);padding:12px 24px;background:${type === 'success' ? '#10b981' : '#ef4444'};color:white;border-radius:8px;font-family:system-ui,sans-serif;font-size:14px;z-index:10003;box-shadow:0 4px 12px rgba(0,0,0,0.2);animation:praqtToastIn 0.3s ease-out;`;
            toast.textContent = msg;
            document.body.appendChild(toast);
            setTimeout(() => toast.remove(), 3000);
        },

        copyToClipboard(text) {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(text)
                    .then(() => Utils.showToast('Cupom copiado!'))
                    .catch(() => Utils.fallbackCopy(text));
            } else {
                Utils.fallbackCopy(text);
            }
        },

        fallbackCopy(text) {
            const textarea = document.createElement('textarea');
            textarea.value = text;
            textarea.style.cssText = 'position:fixed;opacity:0';
            document.body.appendChild(textarea);
            textarea.select();
            try {
                document.execCommand('copy');
                Utils.showToast('Cupom copiado!');
            } catch (e) {
                Utils.showToast('Erro ao copiar', 'error');
            }
            document.body.removeChild(textarea);
        },

        isCustomerLoggedIn() {
            if (PLATFORM === 'shopify') {
                return !!window.ShopifyAnalytics?.meta?.page?.customerId;
            }
            if (PLATFORM === 'nuvemshop') {
                return !!(window.LS?.customer?.id);
            }
            return false;
        },

        escapeHtml(html) {
            return html
                .replace(/&/g, '&amp;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;');
        }
    };

    // ============================================================================
    // ESTILOS GLOBAIS (injetados uma vez)
    // ============================================================================

    function injectGlobalStyles() {
        if (document.getElementById('praqt-popup-global-styles')) return;
        const style = document.createElement('style');
        style.id = 'praqt-popup-global-styles';
        style.innerHTML = `
            @keyframes praqtFadeIn { from { opacity: 0; } to { opacity: 1; } }
            @keyframes praqtPopIn { from { transform: scale(0.8); opacity: 0; } to { transform: scale(1); opacity: 1; } }
            @keyframes praqtToastIn { from { opacity: 0; transform: translateX(-50%) translateY(20px); } to { opacity: 1; transform: translateX(-50%) translateY(0); } }
        `;
        document.head.appendChild(style);
    }

    // ============================================================================
    // GERENCIADOR DE EXIBIÇÃO
    // ============================================================================

    const DisplayManager = {
        // Per-popup localStorage tracking
        getPopupData(uuid) {
            return Utils.storage.getJSON(`praqt_popup_${uuid}`) || {
                views: 0,
                subscribed: false,
                lastSeen: null
            };
        },

        savePopupData(uuid, data) {
            Utils.storage.setJSON(`praqt_popup_${uuid}`, data);
        },

        incrementViews(uuid) {
            const data = this.getPopupData(uuid);
            data.views += 1;
            data.lastSeen = Date.now();
            this.savePopupData(uuid, data);
        },

        markSubscribed(uuid) {
            const data = this.getPopupData(uuid);
            data.subscribed = true;
            this.savePopupData(uuid, data);
        },

        shouldShow(uuid, settings) {
            const data = this.getPopupData(uuid);

            const {
                allow_same_customer,
                stop_condition,
                stop_on_subscribe,
                use_max_views,
                max_views,
                require_logged_in
            } = settings;

            // Requer login — verificar se há cliente logado
            if (require_logged_in === true && !Utils.isCustomerLoggedIn()) {
                console.log(`[Praqt Popup ${uuid.slice(0, 8)}] Requires login — skipping`);
                return false;
            }

            // Usuário já se inscreveu — verificar regras de bloqueio
            if (data.subscribed) {
                if (allow_same_customer === false) {
                    console.log(`[Praqt Popup ${uuid.slice(0, 8)}] User already participated`);
                    return false;
                }
                if (stop_condition === 'conditional' && stop_on_subscribe) {
                    console.log(`[Praqt Popup ${uuid.slice(0, 8)}] Stopped: user subscribed`);
                    return false;
                }
            }

            // Limite de visualizações
            if (stop_condition === 'conditional' && use_max_views && max_views) {
                if (data.views >= parseInt(max_views, 10)) {
                    console.log(`[Praqt Popup ${uuid.slice(0, 8)}] Max views reached (${data.views}/${max_views})`);
                    return false;
                }
            }

            return true;
        },

        setupTriggers(settings, openCallback) {
            const { display_condition, use_delay, delay_seconds, show_on_exit } = settings;

            let opened = false;
            const safeOpen = () => {
                if (opened) return;
                opened = true;
                openCallback();
            };

            // Trigger primário
            if (display_condition === 'immediately' || display_condition === 'on_entry' || !display_condition) {
                if (use_delay && delay_seconds > 0) {
                    setTimeout(safeOpen, delay_seconds * 1000);
                } else {
                    safeOpen();
                }
            } else {
                switch (display_condition) {
                    case 'on_exit': {
                        const handler = e => {
                            if (e.clientY < 10) {
                                document.removeEventListener('mouseout', handler);
                                safeOpen();
                            }
                        };
                        document.addEventListener('mouseout', handler);
                        break;
                    }
                    case 'after_delay': {
                        const delay = parseInt(delay_seconds, 10) || 5;
                        setTimeout(safeOpen, delay * 1000);
                        break;
                    }
                    case 'on_scroll': {
                        const scrollHandler = () => {
                            const scrollPercent = (window.scrollY / (document.body.scrollHeight - window.innerHeight)) * 100;
                            if (scrollPercent >= 50) {
                                window.removeEventListener('scroll', scrollHandler);
                                safeOpen();
                            }
                        };
                        window.addEventListener('scroll', scrollHandler);
                        break;
                    }
                    default:
                        safeOpen();
                }
            }

            // Trigger secundário: exit-intent adicional (se configurado e não é o trigger primário)
            if (show_on_exit && display_condition !== 'on_exit') {
                const exitHandler = e => {
                    if (e.clientY < 10) {
                        document.removeEventListener('mouseout', exitHandler);
                        safeOpen();
                    }
                };
                document.addEventListener('mouseout', exitHandler);
            }
        },

        checkDeviceVisibility(settings) {
            const { show_on_desktop, show_on_mobile, show_on_tablet } = settings;
            const width = window.innerWidth;

            const isMobile = width <= 767;
            const isTablet = width >= 768 && width <= 1024;
            const isDesktop = width > 1024;

            if (isDesktop && show_on_desktop === false) return false;
            if (isTablet && show_on_tablet === false) return false;
            if (isMobile && show_on_mobile === false) return false;

            return true;
        },

        getPopupDimensions(settings) {
            const { orientation, size } = settings;
            const isMobile = window.innerWidth <= 767;

            if (isMobile) {
                return orientation === 'portrait'
                    ? { width: '90vw', height: '85vh' }
                    : { width: '95vw', height: '70vh' };
            }

            // Desktop/tablet: matrix de orientação × tamanho
            const dimensionMap = {
                portrait: {
                    small:  { width: '360px', height: '500px' },
                    medium: { width: '450px', height: '600px' },
                    large:  { width: '550px', height: '700px' },
                },
                landscape: {
                    small:  { width: '500px', height: '380px' },
                    medium: { width: '700px', height: '480px' },
                    large:  { width: '900px', height: '560px' },
                }
            };

            const orient = orientation === 'portrait' ? 'portrait' : 'landscape';
            const sz = ['small', 'medium', 'large'].includes(size) ? size : 'medium';

            return dimensionMap[orient][sz];
        },

        getPositionStyles(position) {
            const map = {
                'top-left':      { alignItems: 'flex-start', justifyContent: 'flex-start', padding: '20px' },
                'top-center':    { alignItems: 'flex-start', justifyContent: 'center',     padding: '20px 0' },
                'top-right':     { alignItems: 'flex-start', justifyContent: 'flex-end',   padding: '20px' },
                'center-left':   { alignItems: 'center',     justifyContent: 'flex-start', padding: '0 20px' },
                'center-center': { alignItems: 'center',     justifyContent: 'center',     padding: '0' },
                'center-right':  { alignItems: 'center',     justifyContent: 'flex-end',   padding: '0 20px' },
                'bottom-left':   { alignItems: 'flex-end',   justifyContent: 'flex-start', padding: '20px' },
                'bottom-center': { alignItems: 'flex-end',   justifyContent: 'center',     padding: '20px 0' },
                'bottom-right':  { alignItems: 'flex-end',   justifyContent: 'flex-end',   padding: '20px' },
            };

            return map[position] || map['center-center'];
        }
    };

    // ============================================================================
    // ROULETTE ANIMATION ENGINE
    // ============================================================================

    const RouletteEngine = {
        generateWheelSVG(prizes, size = 220) {
            if (!prizes || prizes.length === 0) return '';

            const r = 110;
            const cx = 110;
            const cy = 110;
            const arc = (2 * Math.PI) / prizes.length;

            const polarToCartesian = (centerX, centerY, radius, angleInRadians) => ({
                x: centerX + (radius * Math.cos(angleInRadians)),
                y: centerY + (radius * Math.sin(angleInRadians))
            });

            const describeArc = (x, y, radius, startAngle, endAngle) => {
                const start = polarToCartesian(x, y, radius, endAngle);
                const end = polarToCartesian(x, y, radius, startAngle);
                const largeArcFlag = endAngle - startAngle <= Math.PI ? '0' : '1';
                return [
                    'M', x, y,
                    'L', start.x.toFixed(2), start.y.toFixed(2),
                    'A', radius, radius, 0, largeArcFlag, 0, end.x.toFixed(2), end.y.toFixed(2),
                    'Z'
                ].join(' ');
            };

            const getContrastColor = (hexColor) => {
                const hex = hexColor.replace('#', '');
                const r = parseInt(hex.substr(0, 2), 16);
                const g = parseInt(hex.substr(2, 2), 16);
                const b = parseInt(hex.substr(4, 2), 16);
                const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
                return luminance > 0.5 ? '#000000' : '#ffffff';
            };

            let svgContent = '';

            prizes.forEach((prize, i) => {
                const startAngle = i * arc;
                const endAngle = (i + 1) * arc;
                const sliceColor = prize.color || '#ccc';
                const textColor = getContrastColor(sliceColor);

                svgContent += `<path d="${describeArc(cx, cy, r - 3, startAngle, endAngle)}" fill="${sliceColor}" stroke="#fff" stroke-width="2"></path>`;

                const midAngle = startAngle + arc / 2;
                const textX = cx + Math.cos(midAngle) * r * 0.6;
                const textY = cy + Math.sin(midAngle) * r * 0.6;
                const rotationDeg = (midAngle * 180 / Math.PI) + 90;

                const maxChars = 12;
                const label = prize.label.length > maxChars
                    ? prize.label.substring(0, maxChars) + '...'
                    : prize.label;

                svgContent += `<text x="${textX.toFixed(2)}" y="${textY.toFixed(2)}" fill="${textColor}" font-size="11" font-weight="bold" font-family="Arial, sans-serif" text-anchor="middle" dominant-baseline="middle" transform="rotate(${rotationDeg.toFixed(2)}, ${textX.toFixed(2)}, ${textY.toFixed(2)})">${label}</text>`;
            });

            svgContent += `<circle cx="${cx}" cy="${cy}" r="18" fill="#fff" stroke="#e5e7eb" stroke-width="3"></circle>`;

            return `<svg class="roulette-wheel" width="${size}" height="${size}" viewBox="0 0 220 220" style="max-width: 100%; transition: none;">${svgContent}</svg>`;
        },

        reorderPrizesWithWinner(prizes, winningPrizeId) {
            const winnerIndex = prizes.findIndex(p => String(p.id) === String(winningPrizeId));
            if (winnerIndex === -1) return prizes;

            const reordered = [...prizes];
            const winner = reordered.splice(winnerIndex, 1)[0];
            reordered.unshift(winner);
            return reordered;
        },

        calculateFinalRotation(prizeCount, extraSpins = 5) {
            const sliceAngle = 360 / prizeCount;
            const targetRotation = 270 - (sliceAngle / 2);
            return targetRotation + (360 * extraSpins);
        },

        async animateRoulette(iframeDoc, prizes, winningPrizeId, onComplete) {
            const wheelSvg = iframeDoc.querySelector('.roulette-wheel');
            const container = iframeDoc.querySelector('.roulette-container');

            if (!wheelSvg || !container) {
                console.warn('[Praqt Roulette] Wheel SVG or container not found');
                onComplete();
                return;
            }

            wheelSvg.style.transition = 'none';
            wheelSvg.style.transformOrigin = 'center center';

            let currentRotation = 0;
            let isSpinning = true;
            const spinSpeed = 20;

            const spinLoop = () => {
                if (!isSpinning) return;
                currentRotation += spinSpeed;
                wheelSvg.style.transform = `rotate(${currentRotation}deg)`;
                requestAnimationFrame(spinLoop);
            };

            spinLoop();

            return {
                stopAndFinalize: (actualWinningPrizeId) => {
                    isSpinning = false;

                    const prizeId = actualWinningPrizeId || winningPrizeId;
                    const reorderedPrizes = RouletteEngine.reorderPrizesWithWinner(prizes, prizeId);
                    const newSvgHtml = RouletteEngine.generateWheelSVG(reorderedPrizes);
                    const normalizedRotation = currentRotation % 360;
                    const finalRotation = RouletteEngine.calculateFinalRotation(reorderedPrizes.length, 3);

                    container.innerHTML = `
                        <div class="roulette-pointer" style="width: 0; height: 0; border-left: 12px solid transparent; border-right: 12px solid transparent; border-top: 20px solid #6366f1; margin-bottom: -8px; z-index: 10; position: relative;"></div>
                        ${newSvgHtml}
                    `;

                    const newWheel = container.querySelector('.roulette-wheel');
                    if (newWheel) {
                        newWheel.style.transform = `rotate(${normalizedRotation}deg)`;
                        newWheel.style.transformOrigin = 'center center';

                        // Forçar reflow
                        newWheel.offsetHeight;

                        setTimeout(() => {
                            newWheel.style.transition = 'transform 2s cubic-bezier(0.17, 0.67, 0.12, 0.99)';
                            newWheel.style.transform = `rotate(${normalizedRotation + finalRotation}deg)`;
                        }, 50);

                        setTimeout(() => {
                            onComplete();
                        }, 2100);
                    } else {
                        onComplete();
                    }
                }
            };
        }
    };

    // ============================================================================
    // POPUP INSTANCE — cada popup ativo tem sua própria instância
    // ============================================================================

    class PopupInstance {
        constructor(config) {
            this.config = config;
            this.uuid = config.uuid;
            this.type = config.type;
            this.settings = config.config || {};
            this.content = config.content;
            this.successContent = config.success_content;
            this.failContent = config.fail_content;

            this.modal = null;
            this.messageHandler = null;
            this.currentCouponCode = null;
            this.rouletteAnimation = null;
        }

        // IDs únicos por popup para evitar conflito entre múltiplos popups abertos
        getModalId() { return `praqt-popup-modal-${this.uuid}`; }
        getContainerId() { return `praqt-popup-container-${this.uuid}`; }
        getIframeId() { return `praqt-popup-iframe-${this.uuid}`; }
        getCloseId() { return `praqt-popup-close-${this.uuid}`; }

        injectStyles() {
            const id = `praqt-popup-styles-${this.uuid}`;
            if (document.getElementById(id)) return;

            const posStyles = DisplayManager.getPositionStyles(this.settings.position);
            const showClose = this.settings.show_close_button !== false;
            const bgColor = this.settings.background_color || '#fff';
            const modalId = this.getModalId();
            const containerId = this.getContainerId();
            const iframeId = this.getIframeId();
            const closeId = this.getCloseId();

            const style = document.createElement('style');
            style.id = id;
            style.innerHTML = `
                #${CSS.escape(modalId)} {
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100vw;
                    height: 100vh;
                    display: flex;
                    align-items: ${posStyles.alignItems};
                    justify-content: ${posStyles.justifyContent};
                    padding: ${posStyles.padding};
                    z-index: 9999;
                    background: rgba(0, 0, 0, 0.5);
                    backdrop-filter: blur(3px);
                    animation: praqtFadeIn 0.3s ease-out;
                    box-sizing: border-box;
                }
                #${CSS.escape(containerId)} {
                    position: relative;
                    max-width: 90vw;
                    max-height: 90vh;
                    animation: praqtPopIn 0.4s ease-out;
                }
                #${CSS.escape(iframeId)} {
                    border: none;
                    border-radius: 12px;
                    box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
                    background: ${bgColor};
                }
                ${showClose ? `
                #${CSS.escape(closeId)} {
                    position: absolute;
                    top: -12px;
                    right: -12px;
                    width: 32px;
                    height: 32px;
                    background: #fff;
                    border: none;
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 20px;
                    color: #666;
                    cursor: pointer;
                    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
                    transition: all 0.2s;
                    z-index: 10;
                }
                #${CSS.escape(closeId)}:hover {
                    background: #f5f5f5;
                    transform: scale(1.1);
                }` : ''}
            `;
            document.head.appendChild(style);
        }

        getIframeHelperScript() {
            const popupType = this.type;
            const popupUuid = this.uuid;

            return `
                <script>
                (function() {
                    var popupType = '${popupType}';
                    var popupUuid = '${popupUuid}';

                    var masks = {
                        cpf: function(v) {
                            v = v.replace(/\\D/g, '').slice(0, 11);
                            if (v.length <= 3) return v;
                            if (v.length <= 6) return v.replace(/(\\d{3})(\\d+)/, '$1.$2');
                            if (v.length <= 9) return v.replace(/(\\d{3})(\\d{3})(\\d+)/, '$1.$2.$3');
                            return v.replace(/(\\d{3})(\\d{3})(\\d{3})(\\d+)/, '$1.$2.$3-$4');
                        },
                        phone: function(v) {
                            v = v.replace(/\\D/g, '').slice(0, 11);
                            if (v.length <= 2) return v;
                            if (v.length <= 6) return v.replace(/(\\d{2})(\\d{1,4})/, '($1) $2');
                            if (v.length <= 10) return v.replace(/(\\d{2})(\\d{4})(\\d{1,4})/, '($1) $2-$3');
                            return v.replace(/(\\d{2})(\\d{5})(\\d{1,4})/, '($1) $2-$3');
                        }
                    };

                    document.querySelectorAll('input[name="cpf"]').forEach(function(input) {
                        input.addEventListener('input', function(e) {
                            e.target.value = masks.cpf(e.target.value);
                        });
                    });

                    document.querySelectorAll('input[name="whatsapp"], input[name="phone"]').forEach(function(input) {
                        input.addEventListener('input', function(e) {
                            e.target.value = masks.phone(e.target.value);
                        });
                    });

                    // Formulário — interceptar submit apenas para tipos non-announcement
                    if (popupType !== 'announcement') {
                        document.querySelectorAll('form').forEach(function(form) {
                            form.addEventListener('submit', function(e) {
                                e.preventDefault();

                                var formData = new FormData(form);
                                var data = {};
                                formData.forEach(function(value, key) {
                                    data[key] = value;
                                });

                                window.parent.postMessage({
                                    type: 'popup:submit',
                                    popupUuid: popupUuid,
                                    data: data
                                }, '*');
                            });
                        });
                    }

                    // Botões de fechar dentro do popup (fail screen, etc.)
                    document.querySelectorAll('.close-popup-button, [data-close-popup]').forEach(function(el) {
                        el.addEventListener('click', function(e) {
                            e.preventDefault();
                            window.parent.postMessage({
                                type: 'popup:close',
                                popupUuid: popupUuid
                            }, '*');
                        });
                    });

                    // Cupom clicável (copiar para clipboard)
                    document.querySelectorAll('.prize-coupon').forEach(function(el) {
                        el.style.cursor = 'pointer';
                        el.title = 'Clique para copiar';
                        el.addEventListener('click', function(e) {
                            var couponText = el.textContent.trim();
                            window.parent.postMessage({
                                type: 'popup:copy-coupon',
                                popupUuid: popupUuid,
                                coupon: couponText
                            }, '*');
                        });
                    });

                    window.parent.postMessage({
                        type: 'popup:loaded',
                        popupUuid: popupUuid
                    }, '*');
                })();
                <\/script>
            `;
        }

        createIframeContent(templateHtml, couponCode) {
            const parser = new DOMParser();
            const doc = parser.parseFromString(templateHtml, 'text/html');

            // Remover botões de fechar do template (gerenciados pelo modal externo)
            doc.querySelectorAll('.popup-close-btn').forEach(btn => btn.remove());

            // CSS injetado no iframe
            let cssRules = 'html,body{height:100%;margin:0}.bg-image-block{min-height:100%}';

            // Cor de fundo do popup
            if (this.settings.background_color) {
                cssRules += `body{background-color:${this.settings.background_color} !important}`;
            }

            // Imagem de fundo com opacidade
            if (this.settings.background_image) {
                const opacity = (this.settings.background_image_opacity != null)
                    ? parseInt(this.settings.background_image_opacity, 10) / 100
                    : 1;
                cssRules += `
                    body{position:relative}
                    body::before{
                        content:'';
                        position:fixed;
                        top:0;left:0;right:0;bottom:0;
                        background-image:url('${this.settings.background_image}');
                        background-size:cover;
                        background-position:center;
                        background-repeat:no-repeat;
                        opacity:${opacity};
                        z-index:-1;
                        pointer-events:none;
                    }
                `;
            }

            const styleEl = document.createElement('style');
            styleEl.textContent = cssRules;
            doc.head.appendChild(styleEl);

            let processedHtml = doc.documentElement.outerHTML;

            // Substituir [cupom] pelo código real do cupom
            if (couponCode) {
                processedHtml = processedHtml.replace(/\[cupom\]/gi, couponCode);
            }

            // Para formulários (non-announcement): injetar campos hidden
            if (this.type !== 'announcement') {
                const hiddenFields = `
                    <input type="hidden" name="popup_uuid" value="${this.uuid}" />
                    <input type="hidden" name="store_id" value="${STORE_ID}" />
                `;

                if (processedHtml.includes('<form')) {
                    processedHtml = processedHtml.replace(
                        /(<form[^>]*>)/i,
                        `$1${hiddenFields}`
                    );
                } else {
                    processedHtml = processedHtml.replace(
                        /(<body[^>]*>)([\s\S]*?)(<\/body>)/i,
                        `$1<form method="POST">${hiddenFields}$2</form>$3`
                    );
                }
            }

            // Injetar script helper no iframe
            const helperScript = this.getIframeHelperScript();
            if (processedHtml.includes('</body>')) {
                processedHtml = processedHtml.replace('</body>', `${helperScript}</body>`);
            } else {
                processedHtml += helperScript;
            }

            return processedHtml;
        }

        async trackView() {
            try {
                await fetch(`${API_BASE}/popup-view`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ popup_uuid: this.uuid })
                });
            } catch (e) {
                console.warn('[Praqt Popup] Erro ao registrar view:', e);
            }
        }

        validateFormData(data) {
            const errors = [];

            if (data.email && !Utils.validators.email(data.email)) {
                errors.push('E-mail inválido');
            }
            if (data.cpf && !Utils.validators.cpf(data.cpf)) {
                errors.push('CPF inválido');
            }
            if (data.whatsapp && !Utils.validators.whatsapp(data.whatsapp)) {
                errors.push('WhatsApp inválido (deve ter 11 dígitos com DDD)');
            }
            if (data.phone && !Utils.validators.whatsapp(data.phone)) {
                errors.push('Telefone inválido (deve ter 11 dígitos com DDD)');
            }

            return errors;
        }

        // Remove campos que NÃO devem ser enviados ao backend
        // O backend determina o prêmio e cupom — frontend não deve enviá-los
        cleanFormData(data) {
            const cleaned = { ...data };
            delete cleaned.popup_uuid;
            delete cleaned.store_id;
            delete cleaned.coupon;
            delete cleaned.prize;
            return cleaned;
        }

        async submitForm(data) {
            const cleanedData = this.cleanFormData(data);

            const res = await fetch(`${API_BASE}/popup-submit`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    popup_uuid: this.uuid,
                    popup_type: this.type,
                    store_id: STORE_ID,
                    ...cleanedData
                })
            });

            if (!res.ok) {
                const errorData = await res.json().catch(() => ({}));
                throw new Error(errorData.message || 'Erro ao enviar formulário');
            }

            return await res.json();
        }

        updateIframeContent(templateHtml, couponCode) {
            const iframe = document.getElementById(this.getIframeId());
            if (!iframe) return;

            const newContent = this.createIframeContent(templateHtml, couponCode);
            iframe.srcdoc = newContent;
        }

        getIframeDocument() {
            const iframe = document.getElementById(this.getIframeId());
            if (!iframe) return null;
            try {
                return iframe.contentDocument || iframe.contentWindow.document;
            } catch (e) {
                return null;
            }
        }

        close() {
            if (this.rouletteAnimation) {
                this.rouletteAnimation = null;
            }
            if (this.modal) {
                this.modal.remove();
                this.modal = null;
            }
            if (this.messageHandler) {
                window.removeEventListener('message', this.messageHandler);
                this.messageHandler = null;
            }
            // Remover estilos específicos deste popup
            const styleEl = document.getElementById(`praqt-popup-styles-${this.uuid}`);
            if (styleEl) styleEl.remove();

            this.currentCouponCode = null;
        }

        async open() {
            // Verificar visibilidade por dispositivo
            if (!DisplayManager.checkDeviceVisibility(this.settings)) {
                console.log(`[Praqt Popup ${this.uuid.slice(0, 8)}] Not shown (device not allowed)`);
                return;
            }

            // Verificar regras de exibição (login, views, inscrição)
            if (!DisplayManager.shouldShow(this.uuid, this.settings)) {
                return;
            }

            if (!this.content) {
                console.error(`[Praqt Popup ${this.uuid.slice(0, 8)}] Template not found`);
                return;
            }

            // Incrementar views no localStorage
            DisplayManager.incrementViews(this.uuid);

            const dimensions = DisplayManager.getPopupDimensions(this.settings);
            injectGlobalStyles();
            this.injectStyles();

            await this.trackView();

            const showClose = this.settings.show_close_button !== false;
            const iframeContent = this.createIframeContent(this.content, null);

            const modal = document.createElement('div');
            modal.id = this.getModalId();
            modal.innerHTML = `
                <div id="${this.getContainerId()}">
                    ${showClose ? `<button id="${this.getCloseId()}" aria-label="Fechar">&times;</button>` : ''}
                    <iframe
                        id="${this.getIframeId()}"
                        srcdoc="${Utils.escapeHtml(iframeContent)}"
                        style="width: ${dimensions.width}; height: ${dimensions.height}; max-width: 90vw; max-height: 85vh;"
                        scrolling="no"
                    ></iframe>
                </div>
            `;

            document.body.appendChild(modal);
            this.modal = modal;

            // Botão X externo
            if (showClose) {
                const closeBtn = modal.querySelector(`#${this.getCloseId()}`);
                if (closeBtn) closeBtn.onclick = () => this.close();
            }

            // Fechar ao clicar no backdrop
            modal.addEventListener('click', (e) => {
                if (e.target === modal) this.close();
            });

            // Listener de mensagens postMessage do iframe
            this.messageHandler = async (event) => {
                if (!event.data || typeof event.data !== 'object') return;

                // Filtrar mensagens por UUID
                if (event.data.popupUuid && event.data.popupUuid !== this.uuid) return;

                const { type: messageType, data, coupon } = event.data;

                switch (messageType) {
                    case 'popup:close':
                        this.close();
                        break;

                    case 'popup:copy-coupon':
                        if (coupon) Utils.copyToClipboard(coupon);
                        break;

                    case 'popup:submit':
                        await this.handleFormSubmit(data);
                        break;

                    case 'popup:loaded':
                        console.log(`[Praqt Popup ${this.uuid.slice(0, 8)}] Iframe loaded`);
                        break;
                }
            };

            window.addEventListener('message', this.messageHandler);
        }

        async handleFormSubmit(formData) {
            // Validar dados do formulário
            const errors = this.validateFormData(formData);
            if (errors.length > 0) {
                Utils.showErrorModal(errors.join('<br>'));
                return;
            }

            // Extrair dados visuais da roleta do iframe (id, label, color)
            let roulettePrizes = null;
            if (this.type === 'roulette') {
                try {
                    const iframeDoc = this.getIframeDocument();
                    const rouletteBlock = iframeDoc?.querySelector('[data-prizes]');
                    if (rouletteBlock) {
                        roulettePrizes = JSON.parse(rouletteBlock.getAttribute('data-prizes'));
                    }
                } catch (e) {
                    console.warn('[Praqt Popup] Erro ao ler prizes visuais:', e);
                }
            }

            try {
                if (this.type === 'roulette' && roulettePrizes) {
                    await this.handleRouletteSubmit(formData, roulettePrizes);
                } else if (this.type === 'default') {
                    await this.handleDefaultSubmit(formData);
                } else {
                    // Announcement — fecha sem enviar nada
                    this.close();
                }
            } catch (e) {
                Utils.showErrorModal(e.message || 'Erro ao processar. Tente novamente.');
            }
        }

        async handleRouletteSubmit(formData, roulettePrizes) {
            const iframe = document.getElementById(this.getIframeId());
            const iframeDoc = iframe?.contentDocument || iframe?.contentWindow?.document;

            if (!iframeDoc) {
                throw new Error('Iframe não acessível');
            }

            // Iniciar animação de giro ANTES da chamada ao backend
            const animationController = await RouletteEngine.animateRoulette(
                iframeDoc,
                roulettePrizes,
                null,
                () => {}
            );

            // Submeter ao backend enquanto gira
            const result = await this.submitForm(formData);

            // Marcar como inscrito no localStorage
            DisplayManager.markSubscribed(this.uuid);

            // Parar animação e mostrar resultado
            if (animationController && result.prize_id) {
                animationController.stopAndFinalize(result.prize_id);

                // Aguardar animação terminar e exibir tela de resultado
                setTimeout(() => {
                    if (result.won && this.successContent) {
                        this.currentCouponCode = result.coupon_code || null;
                        this.updateIframeContent(this.successContent, this.currentCouponCode);
                    } else if (!result.won && this.failContent) {
                        this.updateIframeContent(this.failContent, null);
                    } else {
                        this.close();
                        Utils.showToast(result.won ? 'Parabéns, você ganhou!' : 'Não foi dessa vez...');
                    }
                }, 2200);
            } else {
                // Fallback se algo der errado com a animação
                this.close();
                Utils.showToast(result.won ? 'Parabéns!' : 'Não foi dessa vez...');
            }
        }

        async handleDefaultSubmit(formData) {
            const result = await this.submitForm(formData);

            // Marcar como inscrito no localStorage
            DisplayManager.markSubscribed(this.uuid);

            if (this.successContent) {
                this.currentCouponCode = result.coupon_code || null;
                this.updateIframeContent(this.successContent, this.currentCouponCode);
            } else {
                this.close();
                Utils.showToast('Cadastro realizado com sucesso!');
            }
        }
    }

    // ============================================================================
    // INICIALIZAÇÃO — REGISTRAR TODOS OS POPUPS ATIVOS
    // ============================================================================

    activePopups.forEach(config => {
        const settings = config.config || {};
        DisplayManager.setupTriggers(settings, () => {
            const instance = new PopupInstance(config);
            instance.open();
        });
    });

})();
