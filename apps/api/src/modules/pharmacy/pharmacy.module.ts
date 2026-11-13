import { Module } from '@nestjs/common';
import { PharmacyController } from './pharmacy.controller';
import { PharmacyService } from './pharmacy.service';
import { AuditModule } from '../audit/audit.module';
import { OpsController } from './ops.controller';
import { OrganizationsService } from '../organizations/organizations.service';

@Module({
  imports: [AuditModule],
  controllers: [PharmacyController, OpsController],
  providers: [PharmacyService, OrganizationsService],
})
export class PharmacyModule {}
