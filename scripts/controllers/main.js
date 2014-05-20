'use strict';

angular.module('addSubtractApp')
  .controller('MainCtrl', function ($scope) {
  	$scope.add = false;
  	$scope.subtract = false;

  	$scope.submitAdd = function(){
  		$scope.add = true;
  	  	$scope.subtract = false;	
  	};

  	$scope.submitSubtract = function () {
   		$scope.add = false;
  	  	$scope.subtract = true; 		
  	}


 
  });
