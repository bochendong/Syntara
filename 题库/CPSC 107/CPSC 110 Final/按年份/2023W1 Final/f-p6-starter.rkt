;; The first three lines of this file were inserted by DrRacket. They record metadata
;; about the language level of this file in a form that our tools can easily process.
#reader(lib "htdp-intermediate-lambda-reader.ss" "lang")((modname f-p6-starter) (read-case-sensitive #t) (teachpacks ()) (htdp-settings #(#t constructor repeating-decimal #f #t none #f () #t)))
;; DO NOT PUT ANYTHING PERSONALLY IDENTIFYING BEYOND YOUR CWL IN THIS FILE.
(require spd/tags)

(@assignment exams/2023w1-f/f-p6) ;Do not edit or remove this tag

(@cwl ???)   ;fill in your CWL here (same as for problem sets)


(@problem 1) ;do not edit or delete this line
(@problem 2) ;do not edit or delete this line
(@problem 3) ;do not edit or delete this line
(@problem 4) ;do not edit or delete this line
(@problem 5) ;do not edit or delete this line
(@problem 6) ;do not edit or delete this line



;; =================
;; Data Definitions: 

(@htdd Node)
(define-struct node (number nexts))
;; Node is (make-node Natural (listof Natural))
;; interp. node's number, and list of numbers of nodes that the arrows point to

(define N101 (make-node 101 (list 102 108 107)))


(@htdd Map)
#|
 A Map is AN OPAQUE DATA STRUCTURE that represents one or more maps.
 OPAQUE means you can't look inside it.  THE ONLY THING YOU ARE ALLOWED TO DO
 WITH A MAP IS PASS IT TO generate-node.

 generate-node is defined at the bottom of the file. You should treat it as a
 primitive function described as follows:

 ----
 generate-node
 Map Natural -> Node

 If a node with the given number exists in the given map then generate and 
 produce it.  Signal an error if no node with the given number exists in the 
 map.
 ----

 The bottom of the file defines a map called MAP for the graphs shown in
 
     f-p6-figure.pdf
 
 But the functions you design must work for any map.
|#

;;
;; Here are normal recursion and tail recursion templates for the graph.
;;
#;
(define (fn-for-graph/nr map num0)  
  (local [(define (fn-for-node n)
            (local [(define num (node-number n))
                    (define nexts (node-nexts n))]
              (cond [(...) (...)] ;stop cycles
                    [else
                     (fn-for-lonn nexts)])))
          
          (define (fn-for-lonn lonn)
            (cond [(empty? lonn) (...)]
                  [else
                   (... (first lonn)
                        (fn-for-node (generate-node map (first lonn)))
                        (fn-for-lonn (rest lonn)))]))]
    
    (fn-for-? ...num0)))

#;
(define (fn-for-graph/tr map num0)
  ;; nn-wl is (listof Natural); node number worklist
  ;; fn-for-node adds the unvisited direct subs of n
  ;; fn-for-lonn takes node numbers off one at a time to call fn-for-node
  (local [(define (fn-for-node n nn-wl)
            (local [(define num (node-number n))
                    (define nexts (node-nexts n))]
              (cond [(...) (...)] ;stop cycles
                    [else
                     (fn-for-lonn (append nexts nn-wl))])))
          
          (define (fn-for-lonn nn-wl visited)
            (cond [(empty? nn-wl) (...)] 
                  [else
                   (fn-for-node (generate-node map (first nn-wl))
                                (rest nn-wl))]))]

    (fn-for-? ...num0)))


;; =================
;; Functions:

#|

 Complete the design of a function that consumes a Map and one natural number.
 The function should traverse the graph starting from the given node number.
 It should identify which nodes have only one arrow into them and produce a
 list of those node numbers.
 
 We have provided a set of check-expects below. These show what your function
 needs to do, but we will also test it with different tests.

 TO BE CLEAR, the arguments are map and start IN THAT ORDER.

 NOTE: This problem will be autograded, and ALL OF THE FOLLOWING ARE ESSENTIAL
       IN YOUR SOLUTION.  Failure to follow these requirements may result in
       receiving zero marks for this problem.

 - The function you design MUST BE CALLED one-exit-to-only. 
 - You MUST FOLLOW all applicable design rules.

 - You MUST NOT EDIT above the marked line. WE REALLY MEAN THIS!
 - You MUST NOT EDIT below the other marked line. WE REALLY MEAN THIS!

 - You MUST complete the function definition and then comment out the existing
   stub. Do not delete it.
 
 - You MUST USE one of the two sets of encapsulated templates above.
 - You MUST NOT RENAME any of the local functions within those templates. 
 - You MUST NOT RENAME any of the parameters of those local functions. 
 - You MAY ADD ADDITIONAL PARAMETERS to those functions.
 - You MUST USE ALL of the local functions within those templates.

 - You MUST NOT COMMENT out any @ metadata tags.
 
 - The file MUST NOT have any errors when the Check Syntax button is pressed.
   Press Check Syntax and Run often, and correct any errors early.

|#

; (define-struct node (number nexts))
; (define-struct node (name neighbour))

(@htdf one-exit-to-only)
(@signature Map Natural -> (listof Natural))
;; Traverse from start; produce numbers of nodes with only one arrow into them
(check-expect (one-exit-to-only MAP   1) (list 1 2 3 4 5 6 8 9))
(check-expect (one-exit-to-only MAP  11) (list 11 13 14 15 16 17 18))
(check-expect (one-exit-to-only MAP 101) (list 101 102 104 105 106 107))

(@template-origin genrec arb-tree accumulator)

;; *** Must not edit any line above here. ***

(define (one-exit-to-only map0 start )
  (local
    [(define (neighbour-function state)
       (node-nexts (generate-node map0 state))
       )
      
     (define (fn-for-state state path visited state-wl path-wl ans)
       (local
         [(define neighbours (neighbour-function state))
          (define number state)]
         (cond
           [(member? number visited) 
            (fn-for-los state-wl path-wl visited (remove number ans))  ;; 
            ]
           [else
            (fn-for-los (append neighbours state-wl) 
                        (append (make-list (length neighbours)
                                            (append path (list number)))
                                path-wl)     
                        (cons number visited)
                        (append ans (list number)) ;; 
                        ) 
            ])))

     (define (fn-for-los state-wl path-wl visited ans)
       (cond
         [(empty? state-wl) ans] ;; 
         [else (fn-for-state (first state-wl)
                             (first path-wl)
                             visited
                             (rest state-wl)
                             (rest path-wl)
                             ans  ;; 
                             )]))
     ]
    (fn-for-state start empty empty empty empty empty)))


;; *** Must not edit any line below here. ***

;;
;; generate-node is a primitive described-above.
;;
;; You should not look at and definitely must not edit this code.
;;


(@htdf generate-node)
(@signature Map Natural -> Node)
;; Give map and node number (name), generate corresponding node
(define (generate-node map number)
  (local [(define entry (assoc number map))]
    (if (false? entry)
        (error "Node with given number does not exist." number)
        (apply make-node entry))))


(define MAP '((1 (2 6)) 
              (2 (3 5))
              (3 (4))
              (4 ())
              (5 ())
              (6 (8))
              (8 (9))
              (9 ())

              (11 (12 15 16))
              (12 (13 14))
              (13 ())
              (14 (12))
              (15 ())
              (16 (17 18))
              (17 ())
              (18 ())

              (101 (102 108 107))
              
              (102 (103))
              (108 (103))
              (107 ())
              
              (103 (104 105))
              
              (104 ())
              (105 (106))
              (106 (108))


              (-1   (-2 -5))
              (-2   (-3 -4))
              (-3   ())
              (-4   ())
              (-5   ())

              (-11  (-12))
              (-12  (-13))
              (-13  (-11))

              (-101 (-102 -103))
              
              (-102 (-104))
              (-103 (-104))
              
              (-104 (-105))              
              (-105 (-106))              
              (-106 (-107 -105))
              (-107 (-105))))
