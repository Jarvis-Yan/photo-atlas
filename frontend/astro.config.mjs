import {defineConfig} from 'astro/config';
export default defineConfig({output:'static',prefetch:{defaultStrategy:'hover',prefetchAll:false},build:{format:'directory'},vite:{build:{target:'es2022'}}});
