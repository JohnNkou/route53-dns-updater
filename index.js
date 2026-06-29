import { Route53Client, ListResourceRecordSetsCommand, ChangeResourceRecordSetsCommand } from '@aws-sdk/client-route-53'
import { getRequiredEnv } from './src/util.js'

export default class Route53Handler{
	#client;
	#ZONE_ID;

	constructor(){
		let env = getRequiredEnv();

		this.#client = new Route53Client();
		this.#ZONE_ID = env.ZONE_ID;
	}

	sanitizeDomain(domain){
		if(!domain.endsWith('.')){
			domain += '.';
		}

		return domain;
	}

	retrieveResourceType(records,type){
		return records[type] || []
	}

	async getResource(domain,type){
		domain = this.sanitizeDomain(domain);

		let input = {
			HostedZoneId: this.#ZONE_ID,
			StartRecordName: domain,
			StartRecordType: type
		},
		recordSets = await this.#client.send(new ListResourceRecordSetsCommand(input)).then((r)=> r.ResourceRecordSets);

		if(!type){
			return recordSets.reduce((payload, recordSet)=>{
				let type = recordSet.Type,
				record = payload[type];

				if(!record){
					record = payload[type] = [];
				}

				record.push(...recordSet.ResourceRecords.map((r)=> r.Value));

				return payload;
			},{});
		}
		else{
			return recordSets.filter((r)=> r.Type == type && r.Name == domain).reduce((list,record)=>{
				list.push(...record.ResourceRecords.map((v)=> v.Value));

				return list;
			},[])
		}
	}

	async addResource(domain,type,value,ttl=120,records){
		domain = this.sanitizeDomain(domain);

		if(type){
			let Changes = [],
			input = {
				HostedZoneId: this.#ZONE_ID,
				ChangeBatch: {
					Changes
				}
			},
			action = 'CREATE',
			response,redondant,length;

			if(!Array.isArray(value)){
				value = [value];
			}

			if(!records){
				records = await this.getResource(domain,type);
			}

			if(!Array.isArray(records)){
				records = this.retrieveResourceType(domain,type);
			}

			if(records.length){
				action = 'UPSERT';
			}

			if(type == 'CNAME' && records.length == 1){
				console.warn("Can have two CNAME record for the same domain. Updating instead to the new one provided");
				records = [];
			}

			length = records.length;

			value = value.filter((addr)=> records.includes(addr) == false);

			if(value.length){
				records.push(...value);
				Changes.push({
					Action: action,
					ResourceRecordSet:{
						Name: domain,
						Type: type,
						TTL:ttl,
						ResourceRecords: records.map((Value)=> ({ Value }))
					},
				});

				response = await this.#client.send(new ChangeResourceRecordSetsCommand(input));
			}
			else{
				console.warn("Trying to insert value already in the record. Returning early");
			}

			return true;

		}
		else{
			throw Error("No Type argument provided");
		}
	}

	async deleteResource(domain,type,value,ttl=120){
		domain = this.sanitizeDomain(domain);

		let Changes = [],
		input = {
			HostedZoneId: this.#ZONE_ID,
			ChangeBatch:{
				Changes
			}
		},
		records = await this.getResource(domain,type),
		action = 'UPSERT',
		length,response,original;

		if(!Array.isArray(records)){
			records = this.retrieveResourceType(domain,type);
		}

		length = records.length;

		original = records;
		records = records.filter((v)=> v != value);

		if(records.length != length){
			if(records.length == 0){
				records = original;
				action = 'DELETE';
			}

			Changes.push({
				Action: action,
				ResourceRecordSet:{
					Name: domain,
					Type: type,
					TTL: ttl,
					ResourceRecords: records.map((Value)=>({ Value }))
				}
			})

			response = await this.#client.send(new ChangeResourceRecordSetsCommand(input));

			return true;
		}
		else{
			throw Error(`Value ${value} to delete not in records`)
		}
	}
}