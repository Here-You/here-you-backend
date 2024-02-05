// search.module.ts

import { Module } from '@nestjs/common';
import { SearchService } from './search.service';
import { SearchController } from './search.controller';
import { UserService } from '../user/user.service';
import { SignatureService } from '../signature/signature.service';

@Module({
    controllers: [SearchController],
    providers: [SearchService, UserService, SignatureService],
})
export class SearchModule {}