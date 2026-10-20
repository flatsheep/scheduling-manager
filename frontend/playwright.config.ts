import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'./browser',fullyParallel:true,use:{baseURL:'http://127.0.0.1:8765'},webServer:{command:'node browser/server.mjs',url:'http://127.0.0.1:8765',reuseExistingServer:false},reporter:'list'});
