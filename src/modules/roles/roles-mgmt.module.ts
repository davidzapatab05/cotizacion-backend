import { Module } from '@nestjs/common';
import { RolesMgmtService } from './roles-mgmt.service';
import { RolesMgmtController } from './roles-mgmt.controller';

@Module({
  providers: [RolesMgmtService],
  controllers: [RolesMgmtController],
  exports: [RolesMgmtService],
})
export class RolesMgmtModule {}
