;; The first three lines of this file were inserted by DrRacket. They record metadata
;; about the language level of this file in a form that our tools can easily process.
#reader(lib "htdp-advanced-reader.ss" "lang")((modname f-p4-starter) (read-case-sensitive #t) (teachpacks ()) (htdp-settings #(#t constructor repeating-decimal #f #t none #f () #f)))
(require spd/tags)

(@assignment exams/2024w2-f/f-p4) ;Do not edit or remove this tag

(@cwl ???)   ;fill in your CWL here

(@problem 1) ;do not edit or delete this line
(@problem 2) ;do not edit or delete this line
(@problem 3) ;do not edit or delete this line
(@problem 4) ;do not edit or delete this line


#|

Given the following data definition:

|#

(@htdd Eevee)
(define-struct eevee (stone evolution))
;; Eevee is (make-evee String String)
;; interp. an Eevee with a desired stone, and their
;;         evolution 
(define EF (make-eevee "fire" "Flareon"))
(define EW (make-eevee "water" "Vaporeon"))
(define ET (make-eevee "thunder" "Jolteon"))
(define EL (make-eevee "leaf" "Leafeon"))
(define EI (make-eevee "ice" "Glaceon"))
(define EE (make-eevee "ever" "Eevee"))

(@dd-template-rules compound)

(define (fn-for-eevee e)
  (... (eevee-stone e)
       (eevee-evolution e)))

#|

 You can think of Eevee as a plant that needs a specific resource to grow.
 A plant may need sunlight to grow, or water to grow. An Eevee
 has a particular stone they want to evolve with as well. For example,
 (make-eevee "fire" "Flareon") will evolve with a "fire" stone but
 will not evolve with any other stone. Similarily,
 (make-eevee "thunder" "Jolteon") will only evolve with a "thunder" stone. 


 Complete the design of a function that consumes a (listof Eevee) and
 (listof String) containing the stones, loe and los. 
 The function should:
   - produce true if the lists have the same length and every Eevee in loe is
     given the desired stone represented as the corresponding strings in los
   - produce false otherwise
 

 You MUST TREAT THIS AS A 2-ONE-OF PROBLEM. 
 Your function MUST TRAVERSE THE LISTS ONE TIME ONLY AND TOGETHER.
 Your function MUST NOT CALL length or list-ref.

 NOTE:
  - you must design this as a 2 one of problem
  - you must include a 2 one of table
  - you must number your table cells and the corresponding
    cond question/answer pairs
  - you may abbreviate (listof Eevee) to LOE and
    (listof String) to LOS 
  - for full credit you must use the table to simplify the
    final function definition

 IF IT IS POSSIBLE TO SIMPLIFY:
  Correct simplified code will get the highest score.
  Correct unsimplified code will get a higher score than incorrect code.

 Your answer must also include @signature, purpose, tests, @template-origin and
 a correct function definition.

 - The function you design MUST BE CALLED can-all-eevolve?. 
 - You MUST FOLLOW all applicable design rules.
 - You MUST complete the function definition and then comment out the existing
   stub. Do not delete it.
 - You MUST NOT COMMENT out any @ metadata tags.
 
 - The file MUST NOT have any errors when the Check Syntax button is pressed.
   Press Check Syntax and Run often, and correct any errors early.

|#

(@htdf can-all-eevolve?)

(define (can-all-eevolve? loe los) false) ;stub
                              


