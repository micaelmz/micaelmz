(async function () {
    'use strict';

    // ============================================================================
    // CONFIGURAÇÃO E INICIALIZAÇÃO
    // ============================================================================

    let STORE_ID = null;

    if (window.Shopify && window.Shopify.shop) {
        STORE_ID = window.Shopify.shop.split('.')[0];
        console.log('[Praqt Popup] Store ID:', STORE_ID);
    } else {
        console.warn('[Praqt Popup] Shopify object not found');
        return;
    }

    if (!STORE_ID) return;

    //const API_BASE = 'https://2fgvxez7z8.execute-api.sa-east-1.amazonaws.com/production';
    const API_BASE = 'https://a5dd-138-186-27-20.ngrok-free.app/local';

    let popupConfig;
    try {
        const res = await fetch(`${API_BASE}/popups?storeId=${STORE_ID}`, {
            method: 'GET',
            headers: {
                'ngrok-skip-browser-warning': '69420',
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }
        });
        if (!res.ok) throw new Error('Erro ao buscar configuração');
        const payload = await res.json();

        // Busca primeiro popup ativo
        popupConfig = payload.popups?.find(p => p.is_active);
        if (!popupConfig) {
            console.log('[Praqt Popup] Nenhum popup ativo encontrado');
            return;
        }
    } catch (e) {
        console.error('[Praqt Popup] Erro ao carregar popup:', e);
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
            },
            getRaw(key) {
                try { return localStorage.getItem(key); }
                catch (_) { return null; }
            },
            setRaw(key, val) {
                try { localStorage.setItem(key, val); }
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
                for (let i = 0; i < 9; i++) {
                    sum += parseInt(cpf.charAt(i), 10) * (10 - i);
                }
                let rev = 11 - (sum % 11);
                if (rev >= 10) rev = 0;
                if (rev !== parseInt(cpf.charAt(9), 10)) return false;

                sum = 0;
                for (let i = 0; i < 10; i++) {
                    sum += parseInt(cpf.charAt(i), 10) * (11 - i);
                }
                rev = 11 - (sum % 11);
                if (rev >= 10) rev = 0;
                return rev === parseInt(cpf.charAt(10), 10);
            }
        },

        showErrorModal(msg) {
            document.querySelectorAll('[id$="-modal"]').forEach(el => el.remove());

            const m = document.createElement('div');
            m.id = 'popup-error-modal';
            m.style.cssText = `
                position:fixed;top:0;left:0;width:100vw;height:100vh;
                display:flex;align-items:center;justify-content:center;
                background:rgba(0,0,0,0.6);z-index:10002;
            `;
            m.innerHTML = `
                <div style="background:#fff;padding:20px;border-radius:8px;max-width:300px;
                    text-align:center;font-family:system-ui,sans-serif;">
                    <h2 style="margin-bottom:12px;">🚫 Ops!</h2>
                    <p style="margin-bottom:20px;">${msg}</p>
                    <button id="close-error" style="padding:8px 16px;border:none;
                        background:#ff6b6b;color:#fff;border-radius:4px;cursor:pointer;">
                        Fechar
                    </button>
                </div>
            `;
            document.body.appendChild(m);
            m.querySelector('#close-error').onclick = () => m.remove();
        },

        showToast(msg, type = 'success') {
            const toast = document.createElement('div');
            toast.style.cssText = `
                position: fixed;
                bottom: 20px;
                left: 50%;
                transform: translateX(-50%);
                padding: 12px 24px;
                background: ${type === 'success' ? '#10b981' : '#ef4444'};
                color: white;
                border-radius: 8px;
                font-family: system-ui, sans-serif;
                font-size: 14px;
                z-index: 10003;
                animation: praqtToastIn 0.3s ease-out;
                box-shadow: 0 4px 12px rgba(0,0,0,0.2);
            `;
            toast.textContent = msg;
            document.body.appendChild(toast);
            setTimeout(() => toast.remove(), 3000);
        },

        copyToClipboard(text) {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(text).then(() => {
                    Utils.showToast('Cupom copiado!');
                }).catch(() => {
                    Utils.fallbackCopy(text);
                });
            } else {
                Utils.fallbackCopy(text);
            }
        },

        fallbackCopy(text) {
            const textarea = document.createElement('textarea');
            textarea.value = text;
            textarea.style.position = 'fixed';
            textarea.style.opacity = '0';
            document.body.appendChild(textarea);
            textarea.select();
            try {
                document.execCommand('copy');
                Utils.showToast('Cupom copiado!');
            } catch (e) {
                Utils.showToast('Erro ao copiar', 'error');
            }
            document.body.removeChild(textarea);
        }
    };

    // ============================================================================
    // GERENCIADOR DE EXIBIÇÃO
    // ============================================================================

    const DisplayManager = {
        shouldShow(storagePrefix, settings, popupType) {
            const { allow_same_customer } = settings;

            // Se não permite o mesmo cliente jogar novamente
            if (allow_same_customer === false) {
                const hasPlayed = Utils.storage.getRaw(`${storagePrefix}Played`) === 'true';
                if (hasPlayed) {
                    console.log('[Praqt Popup] Usuário já participou deste popup');
                    return false;
                }
            }

            return true;
        },

        markAsPlayed(storagePrefix) {
            Utils.storage.setRaw(`${storagePrefix}Played`, 'true');
        },

        setupTriggers(settings, openCallback) {
            const { display_condition, delay_seconds } = settings;

            const exitHandler = e => {
                if (e.clientY < 10) openCallback();
            };

            switch (display_condition) {
                case 'immediately':
                case 'on_entry':
                    openCallback();
                    break;
                case 'on_exit':
                    document.addEventListener('mouseout', exitHandler, { once: true });
                    break;
                case 'after_delay':
                    const delay = delay_seconds || 5;
                    setTimeout(openCallback, delay * 1000);
                    break;
                case 'on_scroll':
                    const scrollHandler = () => {
                        const scrollPercent = (window.scrollY / (document.body.scrollHeight - window.innerHeight)) * 100;
                        if (scrollPercent >= 50) {
                            window.removeEventListener('scroll', scrollHandler);
                            openCallback();
                        }
                    };
                    window.addEventListener('scroll', scrollHandler);
                    break;
                default:
                    openCallback();
            }
        },

        checkDeviceVisibility(settings) {
            const { show_on_desktop, show_on_mobile } = settings;
            const isMobile = window.matchMedia('(max-width:767px)').matches;
            const isDesktop = !isMobile;

            if (isDesktop && show_on_desktop === false) {
                return false;
            }
            if (isMobile && show_on_mobile === false) {
                return false;
            }

            return true;
        },

        getPopupDimensions(settings) {
            const { orientation } = settings;
            const isMobile = window.matchMedia('(max-width:767px)').matches;

            if (orientation === 'portrait') {
                return isMobile
                    ? { width: '85vw', height: '85vh' }
                    : { width: '40vw', height: '90vh' };
            }

            // landscape (padrão)
            return isMobile
                ? { width: '90vw', height: '70vh' }
                : { width: '60vw', height: '70vh' };
        }
    };

    // ============================================================================
    // ROULETTE ANIMATION ENGINE
    // ============================================================================

    const RouletteEngine = {
        // Gera o conteúdo SVG da roleta com base nos prêmios
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
                const largeArcFlag = endAngle - startAngle <= Math.PI ? "0" : "1";
                return [
                    "M", x, y,
                    "L", start.x.toFixed(2), start.y.toFixed(2),
                    "A", radius, radius, 0, largeArcFlag, 0, end.x.toFixed(2), end.y.toFixed(2),
                    "Z"
                ].join(" ");
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

        // Reordena os prêmios colocando o vencedor no índice 0
        reorderPrizesWithWinner(prizes, winningPrizeId) {
            const winnerIndex = prizes.findIndex(p => String(p.id) === String(winningPrizeId));
            if (winnerIndex === -1) return prizes;

            const reordered = [...prizes];
            const winner = reordered.splice(winnerIndex, 1)[0];
            reordered.unshift(winner);
            return reordered;
        },

        // Calcula a rotação final para parar no índice 0 (topo)
        calculateFinalRotation(prizeCount, extraSpins = 5) {
            // O índice 0 começa em 0° (3 o'clock), pointer está no topo (270°)
            // Para o índice 0 ficar no topo: rotação = 270 - (0 * sliceAngle + sliceAngle/2)
            const sliceAngle = 360 / prizeCount;
            const targetRotation = 270 - (sliceAngle / 2);
            return targetRotation + (360 * extraSpins);
        },

        // Anima a roleta dentro do iframe
        async animateRoulette(iframeDoc, prizes, winningPrizeId, onComplete) {
            const wheelSvg = iframeDoc.querySelector('.roulette-wheel');
            const container = iframeDoc.querySelector('.roulette-container');

            if (!wheelSvg || !container) {
                console.warn('[Praqt Roulette] Wheel SVG or container not found');
                onComplete();
                return;
            }

            // Fase 1: Começar a girar rápido (infinito até o backend responder)
            wheelSvg.style.transition = 'none';
            wheelSvg.style.transformOrigin = 'center center';

            let currentRotation = 0;
            let isSpinning = true;
            const spinSpeed = 20; // graus por frame

            const spinLoop = () => {
                if (!isSpinning) return;
                currentRotation += spinSpeed;
                wheelSvg.style.transform = `rotate(${currentRotation}deg)`;
                requestAnimationFrame(spinLoop);
            };

            spinLoop();

            // Retornar função para parar e finalizar a animação
            return {
                stopAndFinalize: (actualWinningPrizeId) => {
                    isSpinning = false;

                    // Usar prize_id fornecido ou fallback para o passado na inicialização
                    const prizeId = actualWinningPrizeId || winningPrizeId;

                    // Reordenar prêmios com o vencedor no índice 0
                    const reorderedPrizes = this.reorderPrizesWithWinner(prizes, prizeId);

                    // Regenerar o SVG com a nova ordem (instantâneo, usuário não percebe pois está girando)
                    const newSvgHtml = this.generateWheelSVG(reorderedPrizes);

                    // Calcular rotação atual normalizada e a final
                    const normalizedRotation = currentRotation % 360;
                    const finalRotation = this.calculateFinalRotation(reorderedPrizes.length, 3);

                    // Substituir SVG mantendo a rotação atual
                    container.innerHTML = `
                        <div class="roulette-pointer" style="width: 0; height: 0; border-left: 12px solid transparent; border-right: 12px solid transparent; border-top: 20px solid #6366f1; margin-bottom: -8px; z-index: 10; position: relative;"></div>
                        ${newSvgHtml}
                    `;

                    const newWheel = container.querySelector('.roulette-wheel');
                    if (newWheel) {
                        // Aplicar rotação atual imediatamente
                        newWheel.style.transform = `rotate(${normalizedRotation}deg)`;
                        newWheel.style.transformOrigin = 'center center';

                        // Forçar reflow
                        newWheel.offsetHeight;

                        // Animar até a posição final (2 segundos de desaceleração)
                        setTimeout(() => {
                            newWheel.style.transition = 'transform 2s cubic-bezier(0.17, 0.67, 0.12, 0.99)';
                            newWheel.style.transform = `rotate(${normalizedRotation + finalRotation}deg)`;
                        }, 50);

                        // Chamar callback após animação terminar
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
    // POPUP RENDERER (IFRAME-BASED)
    // ============================================================================

    const PopupRenderer = {
        modal: null,
        messageHandler: null,
        currentConfig: null,
        currentCouponCode: null,
        rouletteAnimation: null,

        injectStyles(backgroundColor) {
            const existing = document.getElementById('praqt-popup-styles');
            if (existing) existing.remove();

            const style = document.createElement('style');
            style.id = 'praqt-popup-styles';
            style.innerHTML = `
                #praqt-popup-modal {
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100vw;
                    height: 100vh;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    z-index: 9999;
                    background: ${backgroundColor || 'rgba(0, 0, 0, 0.5)'};
                    backdrop-filter: blur(3px);
                    animation: praqtFadeIn 0.3s ease-out;
                }
                @keyframes praqtFadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                @keyframes praqtToastIn {
                    from { opacity: 0; transform: translateX(-50%) translateY(20px); }
                    to { opacity: 1; transform: translateX(-50%) translateY(0); }
                }
                #praqt-popup-container {
                    position: relative;
                    max-width: 90vw;
                    max-height: 90vh;
                    animation: praqtPopIn 0.4s ease-out;
                }
                @keyframes praqtPopIn {
                    from { transform: scale(0.8); opacity: 0; }
                    to { transform: scale(1); opacity: 1; }
                }
                #praqt-popup-iframe {
                    border: none;
                    border-radius: 12px;
                    box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
                    background: #fff;
                }
                #praqt-popup-close {
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
                #praqt-popup-close:hover {
                    background: #f5f5f5;
                    transform: scale(1.1);
                }
            `;
            document.head.appendChild(style);
        },

        getIframeHelperScript(popupType) {
            return `
                <script>
                (function() {
                    var popupType = '${popupType}';

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

                    // Formulário só para tipos que precisam (default, roulette)
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
                                    data: data
                                }, '*');
                            });
                        });
                    }

                    // Botão de fechar
                    document.querySelectorAll('.close-popup-button, [data-close-popup]').forEach(function(el) {
                        el.addEventListener('click', function(e) {
                            e.preventDefault();
                            window.parent.postMessage({ type: 'popup:close' }, '*');
                        });
                    });

                    // Cupom clicável
                    document.querySelectorAll('.prize-coupon').forEach(function(el) {
                        el.style.cursor = 'pointer';
                        el.title = 'Clique para copiar';
                        el.addEventListener('click', function(e) {
                            var couponText = el.textContent.trim();
                            window.parent.postMessage({
                                type: 'popup:copy-coupon',
                                coupon: couponText
                            }, '*');
                        });
                    });

                    window.parent.postMessage({ type: 'popup:loaded' }, '*');
                })();
                <\/script>
            `;
        },

        createIframeContent(templateHtml, popupUuid, storeId, popupType, couponCode = null) {
            const parser = new DOMParser();
            const doc = parser.parseFromString(templateHtml, 'text/html');
            const closeBtn = doc.querySelector('.popup-close-btn');
            if (closeBtn) closeBtn.remove();

            let processedHtml = doc.documentElement.outerHTML;

            // Substituir [cupom] pelo código real
            if (couponCode) {
                processedHtml = processedHtml.replace(/\[cupom\]/gi, couponCode);
            }

            // Wrap em form apenas para tipos que precisam
            if (popupType !== 'announcement') {
                const hiddenFields = `
                    <input type="hidden" name="popup_uuid" value="${popupUuid}" />
                    <input type="hidden" name="store_id" value="${storeId}" />
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

            const helperScript = this.getIframeHelperScript(popupType);
            if (processedHtml.includes('</body>')) {
                processedHtml = processedHtml.replace('</body>', `${helperScript}</body>`);
            } else {
                processedHtml += helperScript;
            }

            return processedHtml;
        },

        async trackView(uuid) {
            try {
                await fetch(`${API_BASE}/popup-view`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ popup_uuid: uuid })
                });
            } catch (e) {
                console.warn('[Praqt Popup] Erro ao registrar view:', e);
            }
        },

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
        },

        async submitForm(data, popupUuid, popupType) {
            const res = await fetch(`${API_BASE}/popup-submit`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    popup_uuid: popupUuid,
                    popup_type: popupType,
                    store_id: STORE_ID,
                    ...data
                })
            });

            if (!res.ok) {
                const errorData = await res.json().catch(() => ({}));
                throw new Error(errorData.message || 'Erro ao enviar formulário');
            }

            return await res.json();
        },

        updateIframeContent(templateHtml, couponCode = null) {
            const iframe = document.getElementById('praqt-popup-iframe');
            if (!iframe) return;

            const { uuid, type } = this.currentConfig;
            const newContent = this.createIframeContent(templateHtml, uuid, STORE_ID, type, couponCode);
            iframe.srcdoc = newContent;
        },

        getIframeDocument() {
            const iframe = document.getElementById('praqt-popup-iframe');
            if (!iframe) return null;
            try {
                return iframe.contentDocument || iframe.contentWindow.document;
            } catch (e) {
                return null;
            }
        },

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
            this.currentConfig = null;
            this.currentCouponCode = null;
        },

        async open(config) {
            const { uuid, type, content, success_content, fail_content, config: settings } = config;

            this.currentConfig = config;

            // Verificações de exibição
            if (!DisplayManager.checkDeviceVisibility(settings || {})) {
                console.log('[Praqt Popup] Popup não exibido (dispositivo não permitido)');
                return;
            }

            if (!DisplayManager.shouldShow(`popup_${uuid}_`, settings || {}, type)) {
                console.log('[Praqt Popup] Popup não exibido (usuário já participou)');
                return;
            }

            if (!content) {
                console.error('[Praqt Popup] Template não encontrado');
                return;
            }

            const dimensions = DisplayManager.getPopupDimensions(settings || {});
            this.injectStyles(settings?.background_color);

            await this.trackView(uuid);

            const modal = document.createElement('div');
            modal.id = 'praqt-popup-modal';

            const iframeContent = this.createIframeContent(content, uuid, STORE_ID, type);

            modal.innerHTML = `
                <div id="praqt-popup-container">
                    <button id="praqt-popup-close" aria-label="Fechar">&times;</button>
                    <iframe
                        id="praqt-popup-iframe"
                        srcdoc="${this.escapeHtml(iframeContent)}"
                        style="width: ${dimensions.width}; height: ${dimensions.height}; min-width: 300px; min-height: 400px; max-width: 90vw; max-height: 85vh;"
                        scrolling="no"
                    ></iframe>
                </div>
            `;

            document.body.appendChild(modal);
            this.modal = modal;

            modal.querySelector('#praqt-popup-close').onclick = () => this.close();
            modal.addEventListener('click', (e) => {
                if (e.target === modal) this.close();
            });

            this.messageHandler = async (event) => {
                if (!event.data || typeof event.data !== 'object') return;

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
                        console.log('[Praqt Popup] Iframe carregado');
                        break;
                }
            };

            window.addEventListener('message', this.messageHandler);
        },

        async handleFormSubmit(formData) {
            const { uuid, type, success_content, fail_content, config: settings } = this.currentConfig;

            // Validar dados
            const errors = this.validateFormData(formData);
            if (errors.length > 0) {
                Utils.showErrorModal(errors.join('<br>'));
                return;
            }

            // Extrair dados visuais da roleta do iframe (apenas id, label, color — sem dados sensíveis)
            let roulettePrizes = null;
            if (type === 'roulette') {
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
                if (type === 'roulette' && roulettePrizes) {
                    // Para roleta: iniciar animação ANTES de enviar para o backend
                    const iframe = document.getElementById('praqt-popup-iframe');
                    const iframeDoc = iframe?.contentDocument || iframe?.contentWindow?.document;

                    if (iframeDoc) {
                        // Iniciar animação de giro
                        const animationController = await RouletteEngine.animateRoulette(
                            iframeDoc,
                            roulettePrizes,
                            null, // prize_id ainda não sabemos
                            () => {} // callback vazio, vamos controlar manualmente
                        );

                        // Fazer requisição ao backend enquanto gira
                        const result = await this.submitForm(formData, uuid, type);

                        // Marcar como jogou
                        DisplayManager.markAsPlayed(`popup_${uuid}_`);

                        // Parar animação e mostrar resultado — usa prize_id do backend
                        if (animationController && result.prize_id) {
                            // stopAndFinalize já reordena e anima internamente
                            animationController.stopAndFinalize(result.prize_id);

                            // Esperar animação terminar e mostrar resultado
                            setTimeout(() => {
                                if (result.won && success_content) {
                                    this.currentCouponCode = result.coupon_code || '';
                                    this.updateIframeContent(success_content, this.currentCouponCode);
                                } else if (!result.won && fail_content) {
                                    this.updateIframeContent(fail_content);
                                } else {
                                    this.close();
                                    Utils.showToast(result.won ? 'Parabéns, você ganhou!' : 'Não foi dessa vez...');
                                }
                            }, 2200);
                        } else {
                            // Fallback se algo der errado
                            this.close();
                            Utils.showToast(result.won ? 'Parabéns!' : 'Não foi dessa vez...');
                        }
                    }

                } else if (type === 'default') {
                    // Popup simples: sempre ganha
                    const result = await this.submitForm(formData, uuid, type);

                    DisplayManager.markAsPlayed(`popup_${uuid}_`);

                    if (success_content) {
                        this.currentCouponCode = result.coupon_code || '';
                        this.updateIframeContent(success_content, this.currentCouponCode);
                    } else {
                        this.close();
                        Utils.showToast('Cadastro realizado com sucesso!');
                    }

                } else {
                    // Announcement ou outro tipo sem form real
                    this.close();
                }

                console.log('[Praqt Popup] Formulário processado com sucesso');

            } catch (e) {
                Utils.showErrorModal(e.message || 'Erro ao processar. Tente novamente.');
            }
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
    // INICIALIZAÇÃO
    // ============================================================================

    DisplayManager.setupTriggers(popupConfig.config || {}, () => {
        PopupRenderer.open(popupConfig);
    });

})();
