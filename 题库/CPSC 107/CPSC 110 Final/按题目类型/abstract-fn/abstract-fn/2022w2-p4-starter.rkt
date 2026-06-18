;; The first three lines of this file were inserted by DrRacket. They record metadata
;; about the language level of this file in a form that our tools can easily process.
#reader(lib "htdp-intermediate-lambda-reader.ss" "lang")((modname 2022w2-p4-starter) (read-case-sensitive #t) (teachpacks ()) (htdp-settings #(#t constructor repeating-decimal #t #t none #f () #f)))
(require spd/tags)

(@assignment exams/2022w2-f/f-p4)

(@cwl ???)   ;fill in your CWL here (same as for problem sets)


(@problem 1) ;do not edit or delete this line
(@problem 2) ;do not edit or delete this line
(@problem 3) ;do not edit or delete this line
(@problem 4) ;do not edit or delete this line


#|

[10 points]

Complete the design of the function below by writing the template origin tag
and the function definition.  

The function consumes a list of strings and produces the length of the longest
string. So, for example:

  (max-length (list "ab" "d" "efg")) should produce 3.

If the list is empty the function should produce 0.

NOTE: This problem will be autograded, and ALL OF THE FOLLOWING ARE ESSENTIAL
      IN YOUR SOLUTION.  Failure to follow these requirements may result in
      receiving zero marks for this problem.

 - The function you design MUST BE CALLED max-length.
 - You MUST NOT EDIT the provided @htdf tag, @signature tag, or purpose.
 - You MUST NOT COMMENT out any @ metadata tags.
 - You MUST NOT EDIT the provided tests.
 - You MUST NOT EDIT any part of the file above the first line marked with ***.
 - You MUST NOT EDIT any part of the file below the second line marked with ***. (OPTIONAL)
 - You MUST FOLLOW all applicable design rules.
 - The file MUST NOT have any errors when the Check Syntax button is pressed.

 - The function definition MUST call one or more built-in abstract functions.

 - You must define a single top-level function with the given name. You are
   permitted to define helpers, but they must be defined within the the
   top-level function using local.

 - The function definition and any helper functions you design MUST NOT be
   recursive.

 - The result of the function must directly be the result of one of the
   built-in abstract functions. So, for example, the following would not
   be a valid function body:

       (define (foo x)
         (empty? (filter ...)))

   This would be a valid function body:

       (define (foo x)
         (local [(define (helper y) (foldr ... ... ...))]
           (helper ...)))

|#

(@htdf max-length)
(@signature (listof String) -> Natural)
;; produce length of longest string; 0 if list is empty
(check-expect (max-length (list)) 0)
(check-expect (max-length (list "ab" "d" "efg")) 3)
(check-expect (max-length (list "abcd" "de" "efg")) 4)

(define (max-length los) 0)



