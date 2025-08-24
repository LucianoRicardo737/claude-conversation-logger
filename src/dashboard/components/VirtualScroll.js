/**
 * Virtual scrolling component for performance optimization with large lists
 */
export const VirtualScroll = {
    props: {
        items: {
            type: Array,
            required: true
        },
        itemHeight: {
            type: Number,
            default: 80
        },
        containerHeight: {
            type: Number,
            default: 400
        },
        buffer: {
            type: Number,
            default: 5
        },
        scrollDebounce: {
            type: Number,
            default: 16 // ~60fps
        }
    },

    data() {
        return {
            scrollTop: 0,
            containerElement: null,
            isScrolling: false,
            scrollTimeout: null
        };
    },

    computed: {
        totalHeight() {
            return this.items.length * this.itemHeight;
        },

        visibleCount() {
            return Math.ceil(this.containerHeight / this.itemHeight);
        },

        startIndex() {
            return Math.max(0, Math.floor(this.scrollTop / this.itemHeight) - this.buffer);
        },

        endIndex() {
            return Math.min(
                this.items.length - 1,
                this.startIndex + this.visibleCount + (this.buffer * 2)
            );
        },

        visibleItems() {
            return this.items.slice(this.startIndex, this.endIndex + 1).map((item, index) => ({
                ...item,
                _virtualIndex: this.startIndex + index,
                _virtualTop: (this.startIndex + index) * this.itemHeight
            }));
        },

        offsetY() {
            return this.startIndex * this.itemHeight;
        }
    },

    mounted() {
        this.containerElement = this.$refs.container;
        this.containerElement.addEventListener('scroll', this.handleScroll);
        
        // Observe container resize
        if (window.ResizeObserver) {
            this.resizeObserver = new ResizeObserver(this.handleResize);
            this.resizeObserver.observe(this.containerElement);
        }
    },

    beforeUnmount() {
        if (this.containerElement) {
            this.containerElement.removeEventListener('scroll', this.handleScroll);
        }
        
        if (this.resizeObserver) {
            this.resizeObserver.disconnect();
        }
        
        if (this.scrollTimeout) {
            clearTimeout(this.scrollTimeout);
        }
    },

    methods: {
        handleScroll() {
            // Debounced scroll handling
            if (this.scrollTimeout) {
                clearTimeout(this.scrollTimeout);
            }

            this.scrollTimeout = setTimeout(() => {
                this.scrollTop = this.containerElement.scrollTop;
                this.isScrolling = false;
                this.$emit('scroll-end', {
                    scrollTop: this.scrollTop,
                    startIndex: this.startIndex,
                    endIndex: this.endIndex
                });
            }, this.scrollDebounce);

            // Immediate update for smooth scrolling
            this.scrollTop = this.containerElement.scrollTop;
            
            if (!this.isScrolling) {
                this.isScrolling = true;
                this.$emit('scroll-start');
            }

            this.$emit('scroll', {
                scrollTop: this.scrollTop,
                startIndex: this.startIndex,
                endIndex: this.endIndex
            });
        },

        handleResize() {
            this.$emit('resize', {
                containerHeight: this.containerElement.clientHeight,
                containerWidth: this.containerElement.clientWidth
            });
        },

        scrollToIndex(index, behavior = 'smooth') {
            if (index < 0 || index >= this.items.length) return;
            
            const targetScrollTop = index * this.itemHeight;
            this.containerElement.scrollTo({
                top: targetScrollTop,
                behavior
            });
        },

        scrollToTop(behavior = 'smooth') {
            this.scrollToIndex(0, behavior);
        },

        scrollToBottom(behavior = 'smooth') {
            this.scrollToIndex(this.items.length - 1, behavior);
        }
    },

    template: `
        <div ref="container" 
             :style="{ height: containerHeight + 'px', overflow: 'auto' }"
             class="virtual-scroll-container">
            <div :style="{ height: totalHeight + 'px', position: 'relative' }" 
                 class="virtual-scroll-content">
                <div :style="{ transform: 'translateY(' + offsetY + 'px)' }" 
                     class="virtual-scroll-items">
                    <div v-for="item in visibleItems" 
                         :key="item._virtualIndex"
                         :style="{ height: itemHeight + 'px' }"
                         class="virtual-scroll-item">
                        <slot :item="item" 
                              :index="item._virtualIndex"
                              :is-visible="true">
                            <!-- Fallback content -->
                            <div class="p-4 border-b border-gray-200 dark:border-gray-700">
                                <div class="text-sm text-gray-900 dark:text-gray-100">
                                    Item {{ item._virtualIndex }}
                                </div>
                            </div>
                        </slot>
                    </div>
                </div>
            </div>
            
            <!-- Loading indicator for virtual scrolling -->
            <div v-if="isScrolling" 
                 class="absolute top-2 right-2 bg-blue-500 text-white px-2 py-1 rounded text-xs">
                Scrolling...
            </div>
        </div>
    `
};