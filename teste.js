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
    const API_BASE = 'https://9db44ea1106d.ngrok-free.app/local';

    let popupConfig;
    try {
        const res = await fetch(`${API_BASE}/popups?storeId=${STORE_ID}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'ngrok-skip-browser-warning': '69420'
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
        }
    };

    // ============================================================================
    // GERENCIADOR DE EXIBIÇÃO
    // ============================================================================

    const DisplayManager = {
        shouldShow(storagePrefix, settings) {
            const { stop_condition, stop_on_subscribe, use_max_views, max_views } = settings;

            if (stop_condition === 'never') return true;

            if (stop_on_subscribe && Utils.storage.getRaw(`${storagePrefix}Subscribed`) === 'true') {
                return false;
            }

            if (use_max_views) {
                const count = parseInt(Utils.storage.getRaw(`${storagePrefix}Views`) || '0', 10);
                if (count >= max_views) return false;
                Utils.storage.setRaw(`${storagePrefix}Views`, String(count + 1));
            }

            return true;
        },

        setupTriggers(settings, openCallback) {
            const { display_condition, show_on_exit, use_delay, delay_seconds } = settings;

            const exitHandler = e => {
                if (e.clientY < 10) openCallback();
            };

            if (display_condition === 'on_entry') {
                openCallback();
            } else if (show_on_exit && use_delay) {
                setTimeout(() => {
                    document.addEventListener('mouseout', exitHandler, { once: true });
                }, delay_seconds * 1000);
            } else if (show_on_exit) {
                document.addEventListener('mouseout', exitHandler, { once: true });
            } else if (use_delay) {
                setTimeout(openCallback, delay_seconds * 1000);
            }
        },

        checkDeviceVisibility(settings) {
            const { show_on_desktop, show_on_tablet, show_on_mobile } = settings;
            const isDesktop = window.matchMedia('(min-width:1025px)').matches;
            const isTablet = window.matchMedia('(min-width:768px) and (max-width:1024px)').matches;
            const isMobile = window.matchMedia('(max-width:767px)').matches;

            return !((isDesktop && !show_on_desktop) ||
                (isTablet && !show_on_tablet) ||
                (isMobile && !show_on_mobile));
        }
    };

    // ============================================================================
    // POPUP RENDERER (IFRAME-BASED)
    // ============================================================================

    const PopupRenderer = {
        modal: null,
        messageHandler: null,

        injectStyles() {
            if (document.getElementById('praqt-popup-styles')) return;
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
                    background: rgba(0, 0, 0, 0.5);
                    backdrop-filter: blur(3px);
                    animation: praqtFadeIn 0.3s ease-out;
                }
                @keyframes praqtFadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
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

        getIframeHelperScript() {
            // Script injetado dentro do iframe para comunicação com o parent
            return `
                <script>
                (function() {
                    // Máscaras de input
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

                    // Aplica máscaras nos inputs baseado no atributo name
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

                    // Intercepta submit do form
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

                    // Botão de fechar (qualquer elemento com data-close-popup)
                    document.querySelectorAll('[data-close-popup]').forEach(function(el) {
                        el.addEventListener('click', function(e) {
                            e.preventDefault();
                            window.parent.postMessage({ type: 'popup:close' }, '*');
                        });
                    });

                    // Notifica o parent que o iframe carregou
                    window.parent.postMessage({ type: 'popup:loaded' }, '*');
                })();
                <\/script>
            `;
        },

        createIframeContent(templateHtml, popupUuid, storeId) {
            // Remove o botão de fechar fake do HTML do popup (o parent já tem um)
            const parser = new DOMParser();
            const doc = parser.parseFromString(templateHtml, 'text/html');
            const closeBtn = doc.querySelector('.popup-close-btn');
            if (closeBtn) {
                closeBtn.remove();
            }
            let processedHtml = doc.documentElement.outerHTML;

            // Injeta campos hidden e o helper script no HTML do template
            const hiddenFields = `
                <input type="hidden" name="popup_uuid" value="${popupUuid}" />
                <input type="hidden" name="store_id" value="${storeId}" />
            `;

            if (templateHtml.includes('<form')) {
                // Se já tem form, injeta os hidden fields dentro dele
                processedHtml = templateHtml.replace(
                    /(<form[^>]*>)/i,
                    `$1${hiddenFields}`
                );
            } else {
                // Se não tem form, wrapa todo o body content em um form
                processedHtml = templateHtml.replace(
                    /(<body[^>]*>)([\s\S]*?)(<\/body>)/i,
                    `$1<form method="POST">${hiddenFields}$2</form>$3`
                );
            }

            // Injeta o helper script antes do </body>
            const helperScript = this.getIframeHelperScript();
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

            // Valida email se presente
            if (data.email && !Utils.validators.email(data.email)) {
                errors.push('E-mail inválido');
            }

            // Valida CPF se presente
            if (data.cpf && !Utils.validators.cpf(data.cpf)) {
                errors.push('CPF inválido');
            }

            // Valida WhatsApp se presente
            if (data.whatsapp && !Utils.validators.whatsapp(data.whatsapp)) {
                errors.push('WhatsApp inválido (deve ter 11 dígitos com DDD)');
            }

            if (data.phone && !Utils.validators.whatsapp(data.phone)) {
                errors.push('Telefone inválido (deve ter 11 dígitos com DDD)');
            }

            return errors;
        },

        async submitForm(data, popupUuid) {
            try {
                const res = await fetch(`${API_BASE}/popup-submit`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        popup_uuid: popupUuid,
                        store_id: STORE_ID,
                        ...data
                    })
                });

                if (!res.ok) {
                    const errorData = await res.json().catch(() => ({}));
                    throw new Error(errorData.message || 'Erro ao enviar formulário');
                }

                return await res.json();
            } catch (e) {
                throw e;
            }
        },

        close() {
            if (this.modal) {
                this.modal.remove();
                this.modal = null;
            }
            if (this.messageHandler) {
                window.removeEventListener('message', this.messageHandler);
                this.messageHandler = null;
            }
        },

        async open(config) {
            const { uuid, template, config: settings } = config;

            // Verifica se deve exibir
            if (!DisplayManager.shouldShow(`popup_${uuid}_`, settings)) {
                console.log('[Praqt Popup] Popup não exibido (condições de parada)');
                return;
            }

            if (!DisplayManager.checkDeviceVisibility(settings)) {
                console.log('[Praqt Popup] Popup não exibido (dispositivo não permitido)');
                return;
            }

            // Verifica se template existe
            if (!template || !template.content) {
                console.error('[Praqt Popup] Template não encontrado');
                return;
            }

            this.injectStyles();
            await this.trackView(uuid);

            // Cria o modal
            const modal = document.createElement('div');
            modal.id = 'praqt-popup-modal';

            const iframeContent = this.createIframeContent(template.content, uuid, STORE_ID);

            // Dimensões responsivas baseadas no dispositivo (igual ao editor GrapeJS)
            const isMobile = window.matchMedia('(max-width:767px)').matches;
            const width = isMobile ? '90vw' : '60vw';
            const height = '70vh';

            modal.innerHTML = `
                <div id="praqt-popup-container">
                    <button id="praqt-popup-close" aria-label="Fechar">&times;</button>
                    <iframe
                        id="praqt-popup-iframe"
                        srcdoc="${this.escapeHtml(iframeContent)}"
                        style="width: ${width}; height: ${height}; max-width: 90vw; max-height: 85vh;"
                        scrolling="no"
                    ></iframe>
                </div>
            `;

            document.body.appendChild(modal);
            this.modal = modal;

            // Botão de fechar do parent
            modal.querySelector('#praqt-popup-close').onclick = () => this.close();

            // Click no backdrop fecha
            modal.addEventListener('click', (e) => {
                if (e.target === modal) this.close();
            });

            // Handler para mensagens do iframe
            this.messageHandler = async (event) => {
                // Ignora mensagens de outras origens
                if (!event.data || typeof event.data !== 'object') return;

                const { type, data } = event.data;

                switch (type) {
                    case 'popup:close':
                        this.close();
                        break;

                    case 'popup:submit':
                        // Valida os dados
                        const errors = this.validateFormData(data);
                        if (errors.length > 0) {
                            Utils.showErrorModal(errors.join('<br>'));
                            return;
                        }

                        // Envia para o backend
                        try {
                            const result = await this.submitForm(data, uuid);

                            // Marca como inscrito no localStorage
                            Utils.storage.setRaw(`popup_${uuid}_Subscribed`, 'true');

                            // Fecha o popup (futuramente: exibir tela de sucesso)
                            this.close();

                            console.log('[Praqt Popup] Formulário enviado com sucesso:', result);
                        } catch (e) {
                            Utils.showErrorModal(e.message || 'Erro ao processar seu cadastro. Tente novamente.');
                        }
                        break;

                    case 'popup:loaded':
                        console.log('[Praqt Popup] Iframe carregado');
                        break;
                }
            };

            window.addEventListener('message', this.messageHandler);

            // Configura triggers para reabrir se necessário
            DisplayManager.setupTriggers(settings, () => {
                if (!this.modal) this.open(config);
            });
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

    PopupRenderer.open(popupConfig);

})();
