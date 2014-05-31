'use strict';

window.Abhi
  .controller('MainCtrl', [ '$scope', function ($scope, Service) {

    $scope.parseFloat = parseFloat;
    $scope.parseInt = parseInt;
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


 
  }]);

