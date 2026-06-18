;; The first three lines of this file were inserted by DrRacket. They record metadata
;; about the language level of this file in a form that our tools can easily process.
#reader(lib "htdp-intermediate-lambda-reader.ss" "lang")((modname f-p7-starter) (read-case-sensitive #t) (teachpacks ()) (htdp-settings #(#t constructor repeating-decimal #f #t none #f () #t)))
(require spd/tags)

(@assignment exams/2024w1-f/f-p7) ;Do not edit or remove this tag

(@cwl ???)   ;fill in your CWL here

(@problem 1) ;do not edit or delete this line
(@problem 2) ;do not edit or delete this line
(@problem 3) ;do not edit or delete this line
(@problem 4) ;do not edit or delete this line
(@problem 5) ;do not edit or delete this line
(@problem 6) ;do not edit or delete this line
(@problem 7) ;do not edit or delete this line

#|
In this problem you will complete the design of a simple search problem solution
by designing two missing functions. You may need to design a helper or helpers
for those functions.

The analysis of the search tree is in f-p7-figure.pdf. Start by studying that
analysis carefully. Below is the following partially complete program. As you
will see, a lot of work has already been done. In this problem you:
 
  - MUST COMPLETE THE 2 WISH LIST ENTRIES with check-expects, a template
    origin tag, and a working function definition 
  - MAY NOT NEED TO, but are PERMITTED to change the check-expects for
    solve, in case your helpers produce results in a different order.
    The autograder will accept any valid results, independent of their
    order.
  - In our solution we found the primitive function remove useful. Remove
    consumes a value of any type and a list of any type, and removes the
    first occurrence of the value in the list if it exists.  For example:

    (remove 2 (list 3 2 4 2)) -> (list 3 4 2)
    (remove 5 (list 3 2 4 2)) -> (list 3 2 4 2)


NOTE: This problem will be autograded.
      **ALL OF THE FOLLOWING ARE ESSENTIAL** in your solution.
      Failure to follow these requirements may result in receiving zero marks.

 - the functions you design must conform to the wish list entries
 - you must design the two functions at top-level, with all recipe elements
 - you must include correct @htdf, @signature and @template-origin tags
 - you must not comment out any of the tags
 - your submission must pass the Check Syntax button
 - you must follow all applicable design rules
 - MUST NOT CHANGE the data definitions or example data
 - MUST NOT CHANGE the signature of any function
 - MUST NOT CHANGE the definition of any function for which there
   is already a complete definition
|#


(@htdd Crate) 
(define-struct crate (label volume bags))
;; Crate is (make-crate String Natural (listof Bag))
;; interp.
;; A crate that can hold bean bags. 
;;         
;;  - label is just a label for the crate, like "A", or "Toronto"
;;  - volume is the total volume of bean bags the crate can hold
;;  - bags is a list of the bean bags the crate already contains
;;
(@htdd Bag)
(define-struct bag (color volume))
;; Bag is (make-bag String Natural)
;; interp. A bean bag with a color and volume (how big it is).
;;
;; NOTE:
;;  Because bean bags are so soft they pack perfectly, so a crate
;;  can hold it's complete volume of bean bags. In other words,
;;  the free space in a crate is volume - (sum of bag volumes)
;;

(define B1 (make-bag "red"    6))
(define B2 (make-bag "green"  4))
(define B3 (make-bag "yellow" 7))


(define C1 (make-crate "YVR" 20 empty))        ;empty crate with volume 20
(define C2 (make-crate "YYZ" 15 (list B1 B3))) ;crate w/ 2 bags, so 13 occupied
;;                                             ;volume and 2 free volume



(@htdd SearchState)
(define-struct ss (crates to-pack))
;; SearchState is (make-ss (listof Crate) (listof Bag))
;; interp. a node in the search tree, with the:
;;          current state of the crates (their packing)
;;          current bean bags remaining to pack
;;         When to-pack is empty the packing is successfully done!

(define SS1 (make-ss (list (make-crate "A" 5 empty)       ;1 empty crate
                           (make-crate "B" 10 (list B1))) ;1 partly full crate
                     (list B2 B3)))                       ;2 bean bags to pack


(@htdf pack)
(@signature (listof Crate) (listof Bag) -> (listof Crate) or false)
;; produce a packing of the given bean bags into the given crates if possible
(check-expect (pack (list)    (list))    (list))
(check-expect (pack (list)    (list B1)) false)
(check-expect (pack (list C1) (list))    (list C1))

(check-expect (pack (list (make-crate "A" 11 (list))
                          (make-crate "B"  9 (list)))
                    (list (make-bag "red" 6)
                          (make-bag "blue" 2)
                          (make-bag "rose" 3)
                          (make-bag "black" 4)
                          (make-bag "white" 5)))
              (list (make-crate "B"  9 (list (make-bag "white" 5)
                                             (make-bag "black" 4)))
                    (make-crate "A" 11 (list (make-bag "rose" 3)
                                             (make-bag "blue" 2)
                                             (make-bag "red" 6)))))

(check-expect (pack (list (make-crate "A" 20 (list))
                          (make-crate "B"  7 (list)))
                    (list (make-bag "red" 5)
                          (make-bag "blue" 2)
                          (make-bag "rose" 8)
                          (make-bag "black" 9)))
              (list (make-crate "A" 20 (list (make-bag "black" 9)
                                             (make-bag "rose" 8)))
                    (make-crate "B"  7 (list (make-bag "blue" 2)
                                             (make-bag "red" 5)))))

(define (pack crates bags)
  (local [(define (pack/one ss)
            (if (all-packed? ss)
                (ss-crates ss)
                (pack/list (next-search-states ss))))
          (define (pack/list loss)
            (cond [(empty? loss) false]
                  [else
                   (local [(define try (pack/one (first loss)))]
                     (if (not (false? try))
                         try
                         (pack/list (rest loss))))]))]

    (pack/one (make-ss crates bags))))



(@htdf all-packed?)
(@signature SearchState -> Boolean)
;; produce true if there are no more bags left to pack
;; !!!
(define (all-packed? ss) false) ;stub


(@htdf next-search-states)
(@signature SearchState -> (listof SearchState))
;; produce search states by adding first unpackaged bag to every crate with room
;; CONSTRAINT: (ss-to-pack ss) is not empty
;; !!!
(define (next-search-states ss) (list)) ;stub

