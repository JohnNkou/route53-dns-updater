export function getRequiredEnv(){
	let required = ['ZONE_ID'],
	[env,missing] = required.reduce((payload, envName)=>{
		let [env,missing] = payload,
		value = process.env[envName];

		if(value){
			env[envName] = value
		}
		else{
			missing.push(envName);
		}

		return payload;
	},[{}, []]);

	if(!missing.length){
		return env;
	}
	else{
		throw Error("The followings environement are missing " + JSON.stringify(missing))
	}
}