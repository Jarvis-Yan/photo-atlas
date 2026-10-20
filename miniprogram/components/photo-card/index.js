Component({

  properties: {
    active:{type:Boolean,value:true},
    interactive:{type:Boolean,value:true},
    compact: {type:Boolean,value:false},
    photo: {type:Object,value:{}},
    priority: {type: Boolean, value: false},
  },
  methods: {
    open() { if(!this.data.interactive)return;this.triggerEvent('open', {photo: this.data.photo}); },
  },
});
