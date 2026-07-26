import { Module } from '@nestjs/common';
import { CustomerRegistryService } from './customer-registry.service';
import { CounterModule } from '../counter/counter.module';

@Module({
  imports: [CounterModule],
  providers: [CustomerRegistryService],
  exports: [CustomerRegistryService],
})
export class CustomerModule {}
