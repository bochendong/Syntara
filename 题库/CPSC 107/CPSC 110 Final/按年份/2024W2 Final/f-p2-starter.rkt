;; The first three lines of this file were inserted by DrRacket. They record metadata
;; about the language level of this file in a form that our tools can easily process.
#reader(lib "htdp-intermediate-lambda-reader.ss" "lang")((modname f-p2-starter) (read-case-sensitive #t) (teachpacks ()) (htdp-settings #(#t constructor repeating-decimal #f #t none #f () #t)))
(require spd/tags)
(require 2htdp/image)

(@assignment exams/2024w2-f/f-p2) ;Do not edit or remove this tag

(@cwl ???)   ;fill in your CWL here

(@problem 1) ;do not edit or delete this line
(@problem 2) ;do not edit or delete this line

#|

Complete the design of the function below by writing appropriate tests, the
template origin tag and the function definition. You must use one or more
built-in abstract function(s) in your solution.

NOTE: This problem will be autograded, and ALL OF THE FOLLOWING ARE ESSENTIAL
      IN YOUR SOLUTION.  Failure to follow these requirements may result in
      receiving zero marks for this problem.

 - The function you design MUST BE CALLED render-longest.

 - You MUST NOT COMMENT out any @ metadata tags.

 - You MUST NOT EDIT any part of the file above the first line marked with ***.

 - You MUST FOLLOW all applicable design rules.

 - The file MUST NOT have any errors when the Check Syntax button is pressed.

 - You must add more tests.

 - The function definition MUST call one or more built-in abstract functions.

 - The function definition and any helper functions you design MUST NOT be
   recursive.

 - You must define a single top-level function with the given name. You are
   permitted to define helpers inside the top-level function, either using
   lambda, or as local definitions using local.

 - The result of the function must directly be the result of one of the
   built-in abstract functions. So, for example, the following would not
   be a valid function body because the result of the function of foo comes
   from empty? not filter.

       (define (foo x)
         (empty? (filter ...)))

   This would be a valid function body because the result of foo comes
   from foldr.

       (define (foo x)
         (local [(define (helper y) (foldr ... ... ...))]
           (helper ...)))

|#

(@htdf render-longest)
(@signature (listof (listof String)) Number Color -> (listof Image))
;; produce list of longest string in each sublist rendered w font-size and color
(check-expect (render-longest (list) 10 "blue") (list))
(check-expect (render-longest (list (list "hi" "hello" "howdy")
                                    (list "traveler" "nomad" "adventurer")
                                    (list "may" "would" "lets"))
                              20
                              "red")
              (list (text "hello" 20 "red")
                    (text "adventurer" 20 "red")
                    (text "would" 20 "red")))

;; *** Must not edit any line above here. ***

(define (render-longest lolos font-size c) empty) 