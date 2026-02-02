import markdownItMathjax3 from 'markdown-it-mathjax3';

console.log('MathJax3 Plugin: Initializing...');

// Safely get global object
const _global = (typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : typeof self !== 'undefined' ? self : {});

// Expose the plugin to the window object
_global.ObsidianWechatMath = (md, options) => {
    console.log('MathJax3 Plugin: Registering with markdown-it...');
    try {
        md.use(markdownItMathjax3, {
            tex: {
                inlineMath: [['$', '$'], ['\\(', '\\)']],
                displayMath: [['$$', '$$'], ['\\[', '\\]']],
            },
            svg: {
                fontCache: 'none', // Crucial for WeChat compatibility
                scale: 1,
                displayAlign: 'center',
                displayIndent: '0'
            },
            options: {
                enableMenu: false,
                assistiveMml: false
            }
        });
        console.log('MathJax3 Plugin: Registered successfully');
    } catch (e) {
        console.error('MathJax3 Plugin: Registration failed', e);
    }
};

console.log('MathJax3 Plugin: Ready (_global.ObsidianWechatMath assigned)');
