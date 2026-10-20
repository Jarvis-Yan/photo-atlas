Component({properties:{loading:{type:Boolean,value:false},error:{type:String,value:''},empty:{type:String,value:''}},methods:{retry(){this.triggerEvent('retry')}}});
