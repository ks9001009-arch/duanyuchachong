import { Module } from '@nestjs/common';
import { CustomerRegistryService } from './customer-registry.service';
import { GroupLeadService } from './group-lead.service';
import { CounterModule } from '../counter/counter.module';

@Module({
  imports: [CounterModule],
  providers: [CustomerRegistryService, GroupLeadService],
  exports: [CustomerRegistryService, GroupLeadService],
})
export class CustomerModule {}
